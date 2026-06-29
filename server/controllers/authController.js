    const User = require("../models/user");
    const bcrypt = require("bcryptjs"); 
    const jwt = require("jsonwebtoken");

    const registerUser =  async (req, res) => {
        try {
            let { name , email , password } = req.body;
            if(!name || !email || !password){
                return res.status(400).json({msg: "Please enter all fields"});
            }
            const userExists = await User.findOne({email});
            if(userExists){
                return res.status(400).json({msg: "User already exists"});
            }
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(password, salt);
            const newUser = new User({
                name,
                email,
                password: hashedPassword
            });
            await newUser.save();
            const token = jwt.sign(
            {
                userId: newUser._id,
            },
                process.env.JWT_SECRET,
            {
                expiresIn: "7d",
            }
        );
            res.status(201).json({
                token,
                user: {
                _id: newUser._id,
                name: newUser.name,
                email: newUser.email
            }
});
        }catch (error) {
            console.error(error);
            res.status(500).json({msg: "Server error"});
        }
    };

    const loginUser = async (req, res) => {
        try {
            const { email, password } = req.body;
            if( !email || !password ) {
                return res.status(400).json({msg: "Please enter all fields"});
            }
            const foundUser = await User.findOne({email});
            if( !foundUser ){
                return res.status(401).json({msg: "Invalid credentials"});
            }
            const isMatch = await bcrypt.compare(password, foundUser.password);
            if( !isMatch ){
                return res.status(401).json({msg: "Invalid credentials"});
            }
            const token = jwt.sign({
                userId: foundUser._id,
            },
            process.env.JWT_SECRET,
            {
                expiresIn: "7d",
            }
        );
            res.status(200).json({
                token,
                user: {
                _id: foundUser._id,
                name: foundUser.name,
                email: foundUser.email
            }
});
        } catch (error) {
            console.error(error);
            res.status(500).json({msg: "Server error"});
        }
    }
const testAuth = (req, res) => {
    res.send("Auth route is working");
}

const getMe = async (req, res) => {
    try {
        const user = await User.findById(req.user.userId).select("-password");
        if(!user) {
            return res.status(404).json({msg: "User not found"});
        }
        res.json(user);
    } catch (error) {
        console.error(error);
        res.status(500).json({msg: "Server error"});
    }
}
    module.exports = { registerUser, loginUser, testAuth, getMe };