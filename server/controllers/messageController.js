const Message = require("../models/message");
const Group = require("../models/group");
const { getIO } = require("../socket");

module.exports.sendMessage = async (req, res) => {
    try {
        const { groupId } = req.params;
        const { content } = req.body;
        const userId = req.user.userId;

        if (!content) {
            return res.status(400).json({
                msg: "Message cannot be empty",
            });
        }

        const group = await Group.findById(groupId);

        if (!group) {
            return res.status(404).json({
                msg: "Group not found",
            });
        }

        const isMember = group.members.some(
            member => member.toString() === userId
        );

        if (!isMember) {
            return res.status(403).json({
                msg: "You are not a member of this group",
            });
        }

        const message = await Message.create({
            content,
            sender: userId,
            group: groupId,
        });

        const populatedMessage = await Message.findById(message._id)
            .populate("sender", "name email")
            .populate("group", "name");

        // --- THE LIVE PART ---
        // The REST request above has already done the important, "must not fail" work:
        // validating, saving to MongoDB. Now that we know it's safely persisted,
        // we push it out live to everyone else currently viewing this group's chat.
        // We use the groupId (a string) as the room name — every socket that called
        // socket.emit("joinGroup", groupId) on the frontend is sitting in this room.
        const io = getIO();
        io.to(groupId).emit("newMessage", populatedMessage);

        res.status(201).json(populatedMessage);

    } catch (error) {
        console.error(error);

        res.status(500).json({
            msg: "Server error",
        });
    }
};

module.exports.getMessages = async (req, res) => {
    try {
        const { groupId } = req.params;
        const userId = req.user.userId;

        const group = await Group.findById(groupId);

        if (!group) {
            return res.status(404).json({
                msg: "Group not found",
            });
        }

        const isMember = group.members.some(
            member => member.toString() === userId
        );

        if (!isMember) {
            return res.status(403).json({
                msg: "You are not a member of this group",
            });
        }

        const messages = await Message.find({
            group: groupId,
        })
            .populate("sender", "name email")
            .sort({ createdAt: 1 });

        res.status(200).json(messages);

    } catch (error) {
        console.error(error);

        res.status(500).json({
            msg: "Server error",
        });
    }
};