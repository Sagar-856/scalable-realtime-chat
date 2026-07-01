const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const { createClient } = require("redis");
const { createAdapter } = require("@socket.io/redis-adapter");
const { streamAIResponse } = require("./services/geminiService");
const Message = require("./models/message");

let io;

// initializeSocket is called once, from server.js, right after the HTTP server is created.
// We pass in the raw HTTP server because Socket.IO attaches itself on top of it —
// it listens for a special "upgrade" request that turns a normal HTTP connection
// into a persistent WebSocket connection.
//
// It's now "async" because connecting to Redis takes a moment (it's a network
// call to Upstash), and we must wait for that connection before the adapter
// can be attached. server.js will need to "await" this function — see notes there.
async function initializeSocket(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || "http://localhost:5173",
      credentials: true,
    },
  });

  // --- REDIS ADAPTER SETUP ---
  // The redis-adapter actually needs TWO separate Redis connections, not one:
  //   - pubClient: used only for PUBLISHING events (e.g. "user sent a message")
  //   - subClient: used only for SUBSCRIBING / listening for events
  // This is a Redis Pub/Sub requirement, not a Socket.IO quirk — a single Redis
  // connection can't both publish AND listen at the same time, so the library
  // needs two. subClient is literally a copy ("duplicate()") of pubClient,
  // just opened as a second connection.
  const pubClient = createClient({ url: process.env.REDIS_URL });
  const subClient = pubClient.duplicate();

  // If Redis has a network hiccup, log it instead of silently failing —
  // makes debugging much easier than a mysteriously "stuck" chat app.
  pubClient.on("error", (err) => console.error("Redis pubClient error:", err));
  subClient.on("error", (err) => console.error("Redis subClient error:", err));

  // .connect() actually opens the TCP connection to Upstash. We wait for
  // BOTH before continuing, since the adapter needs both ready.
  await Promise.all([pubClient.connect(), subClient.connect()]);

  // This single line is what actually changes everything:
  // every io.to(...).emit(...) anywhere in this file (or messageController.js)
  // now automatically gets published through Redis as well as delivered locally.
  // Other server instances, also using this same adapter, will pick it up
  // from Redis and deliver it to whichever users are connected to THEM.
  io.adapter(createAdapter(pubClient, subClient));
  console.log("Socket.IO connected to Redis adapter ✅");

  // --- AUTH MIDDLEWARE FOR SOCKETS ---
  // This is the socket equivalent of your authMiddlware.js for REST routes.
  // It runs once, when a client first tries to connect (before "connection" fires).
  // The client will send its JWT in the connection handshake (we'll wire that up
  // on the frontend in the next step).
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;

    if (!token) {
      return next(new Error("Authentication error: no token provided"));
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.userId; // attach user info to this socket for later use
      next();
    } catch (err) {
      next(new Error("Authentication error: invalid token"));
    }
  });

  // --- MAIN CONNECTION HANDLER ---
  // This fires once per client that successfully connects (i.e. passed the auth check above).
  io.on("connection", (socket) => {
    console.log(`Socket connected: ${socket.id} (user ${socket.userId})`);

    // CLIENT -> SERVER: "join a group room"
    // The client tells us which group chat they're viewing right now.
    // We put their socket into a "room" named after the group's MongoDB id.
    // Rooms are how Socket.IO scopes broadcasts — anything emitted to this
    // room only reaches sockets that joined it, so Group A never sees Group B's messages.
    socket.on("joinGroup", (groupId) => {
      socket.join(groupId);
      console.log(`Socket ${socket.id} joined group ${groupId}`);
    });

    // CLIENT -> SERVER: "I'm leaving this group's chat view"
    // Important for cleanup — otherwise a user who navigates away keeps
    // receiving messages for rooms they're no longer looking at.
    socket.on("leaveGroup", (groupId) => {
      socket.leave(groupId);
      console.log(`Socket ${socket.id} left group ${groupId}`);
    });

    // CLIENT -> SERVER: "send a message"
    // NOTE: actual saving to MongoDB happens in messageController.js (REST),
    // NOT here. This handler is only for the LIVE broadcast part.
    socket.on("sendMessage", (message) => {
      socket.to(message.group).emit("newMessage", message);
    });

    // Typing indicator — broadcast to the room that this user is typing
    socket.on("typing", ({ groupId, userName }) => {
      socket.to(groupId).emit("userTyping", { userName });
    });

    socket.on("stopTyping", ({ groupId, userName }) => {
      socket.to(groupId).emit("userStoppedTyping", { userName });
    });

    // CLIENT -> SERVER: "ask the AI a question"
    // This is the actual streaming flow. We DON'T save anything to MongoDB
    // here yet — we stream chunks live first, and only save the COMPLETE
    // response at the end (see comment below for why).
    socket.on("askAI", async ({ groupId, question, questionMessageId }) => {
      try {
        // Pull the last 10 messages from this group as conversation context,
        // so the AI's answer can reference what was actually discussed.
        const recentMessages = await Message.find({ group: groupId })
          .sort({ createdAt: -1 })
          .limit(10)
          .populate("sender", "name");

        // We fetched newest-first (for an efficient query), but for the AI
        // to read it like a normal conversation, it needs oldest-first —
        // so we reverse it back into chronological order.
        const contextMessages = recentMessages.reverse().map((m) => ({
          senderName: m.isAI ? "AI" : m.sender?.name || "User",
          content: m.content,
        }));

        // Tell the room "AI is starting to respond" — frontend uses this
        // to create an empty message bubble it'll progressively fill in.
        // questionId lets the frontend match this stream to the right
        // question's thread, since multiple AI questions could exist.
        const streamId = `ai-${Date.now()}`; // simple unique id for this streaming response
        io.to(groupId).emit("aiStreamStart", { streamId, questionId: questionMessageId });

        let fullResponse = "";

        // This is the actual streaming loop. Each "for await" iteration
        // happens the MOMENT Gemini produces a new chunk — we immediately
        // emit it to everyone in the room, so they see it appear live,
        // word by word, rather than waiting for the entire answer.
        for await (const chunk of streamAIResponse(contextMessages, question)) {
          fullResponse += chunk;
          io.to(groupId).emit("aiStreamChunk", { streamId, chunk });
        }

        // Tell the room the stream is done (frontend stops showing the
        // "AI is typing" / cursor-blink effect once it gets this).
        io.to(groupId).emit("aiStreamEnd", { streamId });

        // NOW we save the complete response to MongoDB — once, after
        // streaming is fully done. We do it this way (not chunk by chunk)
        // because saving 50+ tiny partial writes to the database for one
        // answer would be wasteful and pointless — the chat history only
        // ever needs the FINAL complete message, not every intermediate piece.
        //
        // replyTo links this answer back to the question that triggered it —
        // the frontend uses this to pair them up when opening the AI panel
        // from a "Read more" click on the question.
        const savedAnswer = await Message.create({
          content: fullResponse,
          group: groupId,
          isAI: true,
          replyTo: questionMessageId || null,
        });

        const populatedAnswer = await Message.findById(savedAnswer._id).populate(
          "replyTo",
          "content"
        );

        // Broadcast the now-saved answer (with its real MongoDB _id) so every
        // client can update its local message list — without this, only the
        // person who asked would end up with the correctly-linked saved
        // version; everyone else still only saw the temporary streaming text.
        io.to(groupId).emit("newMessage", populatedAnswer);
      } catch (err) {
        console.error("AI streaming error:", err);

        // Give the user a more honest message for the "Google's servers are
        // busy" case specifically, instead of a generic catch-all — this is
        // a real, recoverable situation (not our bug), worth saying so.
        const userMessage =
          err?.status === 503
            ? "The AI service is experiencing high demand right now. Please try again in a moment."
            : "AI failed to respond. Please try again.";

        socket.emit("aiStreamError", { message: userMessage });
      }
    });

    socket.on("disconnect", () => {
      console.log(`Socket disconnected: ${socket.id}`);
    });
  });

  return io;
}

// Lets other files (like messageController.js) access the same io instance
// without creating a circular import mess.
function getIO() {
  if (!io) {
    throw new Error("Socket.io not initialized yet");
  }
  return io;
}

module.exports = { initializeSocket, getIO };