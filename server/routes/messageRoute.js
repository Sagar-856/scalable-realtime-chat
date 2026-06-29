const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddlware");
const messageController = require("../controllers/messageController");

router.post(
    "/:groupId",
    authMiddleware,
    messageController.sendMessage
);

router.get(
    "/:groupId",
    authMiddleware,
    messageController.getMessages
);

module.exports = router;