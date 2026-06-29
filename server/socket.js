const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");

let io;

// initializeSocket is called once, from server.js, right after the HTTP server is created.
// We pass in the raw HTTP server because Socket.IO attaches itself on top of it —
// it listens for a special "upgrade" request that turns a normal HTTP connection
// into a persistent WebSocket connection.
function initializeSocket(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || "http://localhost:5173",
      credentials: true,
    },
  });

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
    // We'll connect these two together in the next step.
    socket.on("sendMessage", (message) => {
      // Broadcast to everyone in the room EXCEPT the sender
      // (the sender already has their own message rendered locally for instant feedback)
      socket.to(message.group).emit("newMessage", message);
    });

    // Typing indicator — broadcast to the room that this user is typing
    socket.on("typing", ({ groupId, userName }) => {
      socket.to(groupId).emit("userTyping", { userName });
    });

    socket.on("stopTyping", ({ groupId, userName }) => {
      socket.to(groupId).emit("userStoppedTyping", { userName });
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
