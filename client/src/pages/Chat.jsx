import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { io } from "socket.io-client";
import ReactMarkdown from "react-markdown";
import API from "../services/api";

// We create the socket connection OUTSIDE the component, at module level.
// Why: if we created it inside the component with useState, React's re-renders
// (which happen constantly) would risk creating a fresh connection every time.
// Creating it once, here, means every Chat.jsx instance reuses the same connection.
const socket = io(import.meta.env.VITE_SERVER_URL || "http://localhost:5000", {
    autoConnect: false, // we connect manually once we have a token, see useEffect below
});

function Chat() {
    const { groupId } = useParams();

    const [messages, setMessages] = useState([]);
    const [content, setContent] = useState("");
    const [typingUser, setTypingUser] = useState(null);
    const [currentUserId, setCurrentUserId] = useState(null);
    const [currentUserName, setCurrentUserName] = useState("");

    // Tracks the AI response currently being streamed in, if any.
    // { streamId, questionId, text } — text grows as chunks arrive. null when
    // no AI response is in progress. We render this SEPARATELY from `messages`
    // (not added to that array) until streaming finishes — see aiStreamEnd.
    const [streamingAI, setStreamingAI] = useState(null);

    // --- AI PANEL STATE ---
    // activeAIQuestionId: the _id of the question message whose AI thread is
    // currently shown in the right panel. null = panel is closed.
    const [activeAIQuestionId, setActiveAIQuestionId] = useState(null);

    // A ref (not state) for the message list container, so we can auto-scroll
    // to the bottom on new messages without triggering a re-render.
    const messagesEndRef = useRef(null);

    // Ref to hold the typing-stop timeout, so repeated keystrokes can reset it
    // without creating multiple overlapping timers.
    const typingTimeoutRef = useRef(null);

    const token = localStorage.getItem("token");

    // ---- SETUP: runs once when this page loads ----
    useEffect(() => {
        // 1. Load message history over REST (same as before — nothing live about this part).
        const fetchMessages = async () => {
            try {
                const res = await API.get(`/messages/${groupId}`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                setMessages(res.data);
            } catch (err) {
                console.log(err.response?.data);
            }
        };

        // 2. Figure out who "I" am, so we can tell my own messages apart from others'
        //    when rendering (e.g. align my messages right, theirs left).
        const fetchCurrentUser = async () => {
            try {
                const res = await API.get("/auth/me", {
                    headers: { Authorization: `Bearer ${token}` },
                });
                setCurrentUserId(res.data._id);
                setCurrentUserName(res.data.name);
            } catch (err) {
                console.log(err.response?.data);
            }
        };

        fetchMessages();
        fetchCurrentUser();

        // 3. Connect the socket, authenticating with the same JWT used for REST.
        //    This token is read by the io.use(...) middleware we wrote in socket.js.
        socket.auth = { token };
        socket.connect();

        // 4. Tell the server "I'm viewing this group's chat" — puts our socket
        //    into the room named after groupId, so we receive broadcasts for it.
        socket.emit("joinGroup", groupId);

        // 5. LISTENERS: these fire whenever the SERVER pushes something to us.
        // New message arrives live (sent by someone else in this group):
        socket.on("newMessage", (message) => {
            setMessages((prev) => [...prev, message]);
        });

        // Someone else is typing:
        socket.on("userTyping", ({ userName }) => {
            setTypingUser(userName);
        });

        socket.on("userStoppedTyping", () => {
            setTypingUser(null);
        });

        // --- AI STREAMING LISTENERS ---
        // aiStreamStart: server is about to begin streaming a response.
        // We create an empty bubble (text: "") that we'll progressively fill.
        // questionId lets us match this stream to the right question thread.
        socket.on("aiStreamStart", ({ streamId, questionId }) => {
            setStreamingAI({ streamId, questionId, text: "" });
        });

        // aiStreamChunk: one small piece of the AI's answer just arrived.
        // We append it to whatever we've already shown — this is what
        // creates the "typing live" visual effect.
        socket.on("aiStreamChunk", ({ streamId, chunk }) => {
            setStreamingAI((prev) =>
                prev && prev.streamId === streamId
                    ? { ...prev, text: prev.text + chunk }
                    : prev
            );
        });

        // aiStreamEnd: streaming finished — clear the temporary streaming
        // bubble. We DON'T re-fetch here anymore; the server now broadcasts
        // the saved answer via a normal "newMessage" event (see socket.js),
        // which the listener above already handles adding to `messages`.
        socket.on("aiStreamEnd", () => {
            setStreamingAI(null);
        });

        socket.on("aiStreamError", ({ message }) => {
            setStreamingAI(null);
            alert(message); // simple for now — could be replaced with a nicer toast later
        });

        // ---- CLEANUP: runs when we navigate away from this page ----
        // Critical step people forget: without this, switching between two
        // group chats keeps you "joined" to every room you ever visited,
        // and old listeners pile up and double-fire.
        return () => {
            socket.emit("leaveGroup", groupId);
            socket.off("newMessage");
            socket.off("userTyping");
            socket.off("userStoppedTyping");
            socket.off("aiStreamStart");
            socket.off("aiStreamChunk");
            socket.off("aiStreamEnd");
            socket.off("aiStreamError");
            socket.disconnect();
        };
    }, [groupId]); // re-run this whole setup if the user navigates to a different group

    // Auto-scroll to the latest message whenever the list changes
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    // ---- ASKING THE AI (shared logic) ----
    // Takes the raw question text and does two things: (1) saves + broadcasts
    // the QUESTION itself as a normal chat message (so it's visible in the
    // main chat, not silently swallowed), (2) triggers the AI to stream back
    // its answer. Called from BOTH handleSend (when "/ai " prefix is typed)
    // AND the dedicated "Ask AI" button — same underlying flow either way.
    const askAI = async (question) => {
        try {
            const res = await API.post(
                `/messages/${groupId}`,
                { content: question, senderSocketId: socket.id, isAIQuestion: true },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            setMessages((prev) => [...prev, res.data]);
            setActiveAIQuestionId(res.data._id);
            socket.emit("askAI", { groupId, question, questionMessageId: res.data._id });
        } catch (err) {
            console.log(err.response?.data);
        }
    };

    // ---- SENDING A MESSAGE ----
    // Checks for a "/ai " prefix FIRST — if found, this isn't a normal
    // message to friends at all, it's a question for the AI, so we strip
    // the prefix and route it through askAI() instead of the normal
    // REST-save-and-broadcast flow below.
    const handleSend = async (e) => {
        e.preventDefault();
        if (!content.trim()) return;

        const trimmed = content.trim();
        if (trimmed.toLowerCase().startsWith("/ai ") || trimmed.toLowerCase() === "/ai") {
            const question = trimmed.slice(3).trim(); // remove "/ai" prefix
            setContent("");
            socket.emit("stopTyping", { groupId });
            if (question) {
                await askAI(question);
            }
            return;
        }

        try {
            const res = await API.post(
                `/messages/${groupId}`,
                { content, senderSocketId: socket.id },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            setMessages((prev) => [...prev, res.data]);
            setContent("");
            socket.emit("stopTyping", { groupId });
        } catch (err) {
            console.log(err.response?.data);
        }
    };

    // ---- "Ask AI" BUTTON ----
    // Same destination (askAI) as the "/ai " prefix path above — just a
    // more discoverable, explicit way to do the same thing for users who
    // don't know/remember the "/ai" shortcut.
    const handleAskAIButton = async () => {
        if (!content.trim()) return;
        const question = content;
        setContent("");
        await askAI(question);
    };

    // ---- TYPING INDICATOR ----
    // Emits "typing" on every keystroke, but only emits "stopTyping" after
    // the user pauses for 1.5s (debounced), so we're not spamming the socket.
    const handleChange = (e) => {
        setContent(e.target.value);
        socket.emit("typing", { groupId, userName: currentUserName });

        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => {
            socket.emit("stopTyping", { groupId });
        }, 1500);
    };

    // Finds the AI answer message that replies to a given question's _id.
    // Used both for the "Read more" preview text and for populating the
    // right-side panel once a question is clicked.
    const findAnswerFor = (questionId) =>
        messages.find((m) => m.isAI && m.replyTo?._id === questionId);

    // Currently selected question + its answer (if the answer has arrived
    // yet — it might still be mid-stream, handled separately below).
    const activeQuestion = messages.find((m) => m._id === activeAIQuestionId);
    const activeAnswer = activeAIQuestionId ? findAnswerFor(activeAIQuestionId) : null;

    return (
        <div style={{ display: "flex", height: "100vh" }}>
            {/* ---- LEFT: normal group chat ---- */}
            <div
                style={{
                    display: "flex",
                    flexDirection: "column",
                    flex: activeAIQuestionId ? "1 1 50%" : "1 1 100%",
                    borderRight: activeAIQuestionId ? "1px solid #ddd" : "none",
                    transition: "flex 0.2s ease",
                }}
            >
                <div style={{ flex: 1, overflowY: "auto", padding: "1rem" }}>
                    {messages
                        // AI ANSWER messages are never shown as their own row in the
                        // main chat — they only appear inside the right panel once
                        // their paired question is clicked. Otherwise the same answer
                        // would visually appear twice (once "attached" to the question
                        // preview, once as its own bubble).
                        .filter((msg) => !msg.isAI)
                        .map((msg) => (
                            <div
                                key={msg._id}
                                style={{
                                    textAlign: msg.sender?._id === currentUserId ? "right" : "left",
                                    margin: "0.5rem 0",
                                }}
                            >
                                <strong>{msg.sender?.name}</strong>: {msg.content}

                                {/* AI QUESTION messages get a collapsed preview of their
                                    answer (if it has arrived) plus a "Read more" link
                                    that opens the right panel for this specific thread. */}
                                {msg.isAIQuestion && (
                                    <div
                                        style={{
                                            marginTop: "0.25rem",
                                            padding: "0.5rem",
                                            background: "#f3f3f3",
                                            borderRadius: "6px",
                                            fontSize: "0.9rem",
                                        }}
                                    >
                                        {(() => {
                                            const answer = findAnswerFor(msg._id);
                                            const isThisStreaming =
                                                streamingAI && streamingAI.questionId === msg._id;

                                            if (isThisStreaming) {
                                                // Answer is actively streaming in right now —
                                                // show a short live snippet here too, so the
                                                // main chat reflects that something's happening,
                                                // without needing the panel open.
                                                const preview = streamingAI.text.slice(0, 100);
                                                return (
                                                    <span>
                                                        🤖 {preview}
                                                        {streamingAI.text.length > 100 ? "..." : ""} ▋
                                                    </span>
                                                );
                                            }

                                            if (!answer) {
                                                return <span>🤖 Waiting for AI response...</span>;
                                            }

                                            const preview =
                                                answer.content.length > 100
                                                    ? answer.content.slice(0, 100) + "..."
                                                    : answer.content;

                                            return (
                                                <span>
                                                    🤖 {preview}{" "}
                                                    <button
                                                        type="button"
                                                        onClick={() => setActiveAIQuestionId(msg._id)}
                                                        style={{
                                                            border: "none",
                                                            background: "none",
                                                            color: "#2563eb",
                                                            cursor: "pointer",
                                                            padding: 0,
                                                            fontSize: "0.9rem",
                                                        }}
                                                    >
                                                        Read more →
                                                    </button>
                                                </span>
                                            );
                                        })()}
                                    </div>
                                )}
                            </div>
                        ))}
                    <div ref={messagesEndRef} />
                </div>

                {typingUser && <p style={{ fontStyle: "italic", padding: "0 1rem" }}>{typingUser} is typing...</p>}

                <form onSubmit={handleSend} style={{ display: "flex", padding: "1rem", gap: "0.5rem" }}>
                    <input
                        type="text"
                        value={content}
                        onChange={handleChange}
                        placeholder='Type a message, or "/ai your question"...'
                        style={{ flex: 1, padding: "0.5rem" }}
                    />
                    <button type="submit">Send</button>
                    {/* type="button" is important here — without it, this would also
                        submit the form (since it's inside <form>), triggering BOTH
                        handleSend and handleAskAIButton for a single click. */}
                    <button type="button" onClick={handleAskAIButton} disabled={!!streamingAI}>
                        Ask AI
                    </button>
                </form>
            </div>

            {/* ---- RIGHT: AI panel — only rendered at all when a question is selected ---- */}
            {activeAIQuestionId && (
                <div
                    style={{
                        flex: "1 1 50%",
                        display: "flex",
                        flexDirection: "column",
                        background: "#fafafa",
                    }}
                >
                    <div
                        style={{
                            padding: "1rem",
                            borderBottom: "1px solid #ddd",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                        }}
                    >
                        <strong>AI Conversation</strong>
                        <button type="button" onClick={() => setActiveAIQuestionId(null)}>
                            ✕ Close
                        </button>
                    </div>

                    <div style={{ flex: 1, overflowY: "auto", padding: "1rem" }}>
                        {activeQuestion && (
                            <div style={{ margin: "0.5rem 0" }}>
                                <strong>{activeQuestion.sender?.name || "You"}</strong>:{" "}
                                {activeQuestion.content}
                            </div>
                        )}

                        <div style={{ margin: "0.5rem 0" }}>
                            <strong>🤖 AI</strong>:{" "}
                            {/* While THIS question's answer is still streaming, show the
                                live-updating text here. Once done, show the final saved
                                answer from `messages` instead. */}
                            {streamingAI && streamingAI.questionId === activeAIQuestionId ? (
                                <>
                                    <ReactMarkdown>{streamingAI.text}</ReactMarkdown>
                                    <span>▋</span>
                                </>
                            ) : activeAnswer ? (
                                <ReactMarkdown>{activeAnswer.content}</ReactMarkdown>
                            ) : (
                                <span>Waiting for response...</span>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default Chat;