import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { io } from "socket.io-client";
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

        // ---- CLEANUP: runs when we navigate away from this page ----
        // Critical step people forget: without this, switching between two
        // group chats keeps you "joined" to every room you ever visited,
        // and old listeners pile up and double-fire.
        return () => {
            socket.emit("leaveGroup", groupId);
            socket.off("newMessage");
            socket.off("userTyping");
            socket.off("userStoppedTyping");
            socket.disconnect();
        };
    }, [groupId]); // re-run this whole setup if the user navigates to a different group

    // Auto-scroll to the latest message whenever the list changes
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    // ---- SENDING A MESSAGE ----
    // We still POST over REST (so it's reliably saved to MongoDB and we get
    // a definite success/fail response) — the server then broadcasts it to
    // everyone ELSE in the room via socket. We add it to our OWN list here
    // immediately, for a snappy feel, rather than waiting on a socket echo.
    const handleSend = async (e) => {
        e.preventDefault();
        if (!content.trim()) return;

        try {
            const res = await API.post(
                `/messages/${groupId}`,
                { content },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            setMessages((prev) => [...prev, res.data]);
            setContent("");
            socket.emit("stopTyping", { groupId });
        } catch (err) {
            console.log(err.response?.data);
        }
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

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100vh", maxWidth: 600, margin: "0 auto" }}>
            <div style={{ flex: 1, overflowY: "auto", padding: "1rem" }}>
                {messages.map((msg) => (
                    <div
                        key={msg._id}
                        style={{
                            textAlign: msg.sender._id === currentUserId ? "right" : "left",
                            margin: "0.5rem 0",
                        }}
                    >
                        <strong>{msg.sender.name}</strong>: {msg.content}
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </div>

            {typingUser && <p style={{ fontStyle: "italic", padding: "0 1rem" }}>{typingUser} is typing...</p>}

            <form onSubmit={handleSend} style={{ display: "flex", padding: "1rem" }}>
                <input
                    type="text"
                    value={content}
                    onChange={handleChange}
                    placeholder="Type a message..."
                    style={{ flex: 1, padding: "0.5rem" }}
                />
                <button type="submit">Send</button>
            </form>
        </div>
    );
}

export default Chat;
