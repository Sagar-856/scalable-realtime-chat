const express = require("express");
const http = require("http");
const dotenv = require("dotenv");
const cors = require("cors");
const authRoute = require("./routes/authRoute");
const groupRoute = require("./routes/groupRoute");  
const messageRoute = require("./routes/messageRoute");
const connectDB = require("./config/db");
const { initializeSocket } = require("./socket");



dotenv.config();

connectDB();

const app = express();

app.use(cors());
app.use(express.json());
app.use("/api/auth", authRoute);
app.use("/api/groups", groupRoute);
app.use("/api/messages", messageRoute);

app.get("/", (req, res) => {
  res.send("API Running...");
});

// We create the HTTP server explicitly (instead of letting app.listen() do it
// implicitly) because Socket.IO needs a direct reference to this same server
// object to attach itself on top of it. Express keeps handling normal REST
// requests exactly as before — this change is invisible to your REST routes.
const httpServer = http.createServer(app);

// Hand the server to socket.js, which sets up all the "io.on('connection', ...)" logic.
initializeSocket(httpServer);

const PORT = process.env.PORT || 5000;

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});