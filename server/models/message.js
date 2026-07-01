const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const messageSchema = new Schema(
    {
        content: {
            type: String,
            required: true,
            trim: true,
        },
        sender: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: function () {
                // sender is only required for normal human messages.
                // AI messages (isAI: true) have no real User behind them,
                // so we skip this requirement for those.
                return !this.isAI;
            },
        },
        isAI: {
            type: Boolean,
            default: false,
        },
        // True when this message is a QUESTION the user directed at the AI
        // (sent via the "/ai " prefix or the "Ask AI" button), as opposed to
        // a normal message to the group. Used by the frontend to render this
        // message with a collapsed "Read more" preview instead of full text,
        // and to route it into the split AI panel.
        isAIQuestion: {
            type: Boolean,
            default: false,
        },
        // For AI ANSWER messages (isAI: true), this links back to the
        // question message's _id that triggered it. Lets the frontend pair
        // a question with its answer when building the AI panel's view,
        // without having to guess based on timestamps.
        replyTo: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Message",
            default: null,
        },
        group: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Group",
            required: true,
        },
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model("Message", messageSchema);