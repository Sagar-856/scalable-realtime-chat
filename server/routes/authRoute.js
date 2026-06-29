const express = require("express");
const {registerUser,loginUser,testAuth ,getMe} = require("../controllers/authController");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddlware");


router.post("/register", registerUser);
router.post("/login", loginUser);
router.get("/test", authMiddleware, testAuth);
router.get("/me", authMiddleware, getMe);

module.exports = router;