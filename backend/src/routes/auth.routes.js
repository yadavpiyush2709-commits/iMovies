
const express = require("express");
const { register, login } = require("../controllers/auth.controller");
const authMiddleware = require("../middlewares/auth.middleware");

const router = express.Router();

router.post("/register", register);
router.post("/login", login);

// Protected user profile route
router.get("/me", authMiddleware, (req, res) => {
  res.json({
    success: true,
    message: "Authenticated user",
    user: req.user,
  });
});

module.exports = router;
