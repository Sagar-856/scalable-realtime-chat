const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const groupSchema = new Schema({
    name: {
        type: String,
        required: true
    },
    description: {
        type: String,
    },
    createdBy:{
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    members: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    }]
});

module.exports = mongoose.model("Group", groupSchema);