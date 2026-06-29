const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddlware");
const {
    createGroup,
    getMyGroups,
    getGroupById,
    joinGroup,
    leaveGroup,
    deleteGroup
} = require("../controllers/groupController");

router.post("/", authMiddleware, createGroup);

router.get("/", authMiddleware, getMyGroups);

router.get("/:groupId", authMiddleware, getGroupById);

router.post("/:groupId/join", authMiddleware, joinGroup);

router.post("/:groupId/leave", authMiddleware, leaveGroup);

router.delete("/:groupId", authMiddleware, deleteGroup);

module.exports = router;