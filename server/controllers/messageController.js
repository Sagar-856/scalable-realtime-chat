const Message = require("../models/Message");
const Group = require("../models/Group");

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