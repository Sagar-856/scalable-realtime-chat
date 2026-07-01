const Message = require("../models/message");
const Group = require("../models/group");
const { getIO } = require("../socket");

module.exports.sendMessage = async (req, res) => {
    try {
        const { groupId } = req.params;
        const { content, senderSocketId, isAIQuestion } = req.body;
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
            isAIQuestion: !!isAIQuestion,
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
        //
        // .except(senderSocketId) excludes the sender's OWN socket from this broadcast.
        // Why this is needed: the sender's socket is also a member of this room
        // (they called joinGroup too), so without .except(), they'd receive their
        // own message back from the server — IN ADDITION to the copy we already
        // added to their screen manually in Chat.jsx right after the POST succeeded.
        // That double-delivery was the duplicate-message bug.
        const io = getIO();
        if (senderSocketId) {
            io.to(groupId).except(senderSocketId).emit("newMessage", populatedMessage);
        } else {
            // Fallback: if we don't know the sender's socket id for some reason
            // (e.g. request made outside the normal UI flow), broadcast to everyone.
            // The sender might briefly see a duplicate in this rare case, but it's
            // safer than silently dropping the message for everyone else.
            io.to(groupId).emit("newMessage", populatedMessage);
        }

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
            .populate("replyTo", "content")
            .sort({ createdAt: 1 });

        res.status(200).json(messages);

    } catch (error) {
        console.error(error);

        res.status(500).json({
            msg: "Server error",
        });
    }
};