const Group = require("../models/group");


const createGroup = async (req, res) => {
    try{
        const {name, description } = req.body;
        if( !name ) {
            return res.status(400).json({msg: "Group name is required"});
        }
        const newGroup = new Group({
            name,
            description,
            createdBy: req.user.userId,
            members: [req.user.userId]
        });
        await newGroup.save();
        res.status(201).json(newGroup);
    } catch (error) {
        res.status(500).json({msg: "Error creating group", error});
    }
};

const getMyGroups = async (req, res) => {
    try{
        const userId = req.user.userId;
        const groups = await Group.find({
            members: userId
        })
        console.log(groups);
        res.status(200).json(groups);
    }catch (error) {
        res.status(500).json({msg: "Error creating group", error});
    } 
}


const getGroupById = async (req, res) => {
  try {
    const { groupId } = req.params;

    const group = await Group.findById(groupId)
      .populate("createdBy", "name email")
      .populate("members", "name email");

    if (!group) {
      return res.status(404).json({
        msg: "Group not found"
      });
    }

    // Check if logged-in user is a member
    const isMember = group.members.some(
      (member) => member._id.toString() === req.user.userId
    );

    if (!isMember) {
      return res.status(403).json({
        msg: "You are not a member of this group"
      });
    }

    res.status(200).json(group);

  } catch (error) {
    console.error(error);

    res.status(500).json({
      msg: "Server error"
    });
  }
};



const joinGroup = async (req, res) => {
    try {
        const { groupId } = req.params;
        const userId = req.user.userId;

        const group = await Group.findById(groupId);

        if (!group) {
            return res.status(404).json({
                msg: "Group not found"
            });
        }

        const isAlreadyMember = group.members.some(
            member => member.toString() === userId
        );

        if (isAlreadyMember) {
            return res.status(400).json({
                msg: "You are already a member of this group"
            });
        }

        group.members.push(userId);

        await group.save();

        res.status(200).json({
            msg: "Joined group successfully",
            group
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            msg: "Server error"
        });
    }
};



const leaveGroup = async (req, res) => {
    try {
        const { groupId } = req.params;
        const userId = req.user.userId;

        const group = await Group.findById(groupId);

        if (!group) {
            return res.status(404).json({
                msg: "Group not found"
            });
        }

        const isMember = group.members.some(
            member => member.toString() === userId
        );

        if (!isMember) {
            return res.status(400).json({
                msg: "You are not a member of this group"
            });
        }

        // Group owner cannot leave
        if (group.createdBy.toString() === userId) {
            return res.status(400).json({
                msg: "Group owner cannot leave the group"
            });
        }

        group.members = group.members.filter(
            member => member.toString() !== userId
        );

        await group.save();

        res.status(200).json({
            msg: "Left group successfully"
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            msg: "Server error"
        });
    }
};


const deleteGroup = async (req, res) => {
    try {
        const { groupId } = req.params;
        const userId = req.user.userId;

        const group = await Group.findById(groupId);

        if (!group) {
            return res.status(404).json({
                msg: "Group not found"
            });
        }

        // Only creator can delete
        if (group.createdBy.toString() !== userId) {
            return res.status(403).json({
                msg: "Only group creator can delete this group"
            });
        }

        await Group.findByIdAndDelete(groupId);

        res.status(200).json({
            msg: "Group deleted successfully"
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            msg: "Server error"
        });
    }
};

module.exports = {
    createGroup,getMyGroups,getGroupById,joinGroup,leaveGroup,deleteGroup
};