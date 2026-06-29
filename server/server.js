const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const authRoute = require("./routes/authRoute");
const groupRoute = require("./routes/groupRoute");  
const messageRoute = require("./routes/messageRoute");
const connectDB = require("./config/db");



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

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});