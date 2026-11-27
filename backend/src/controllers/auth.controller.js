
const User = require("../models/User");
const crypto = require("crypto");
const passwordResetEmail = require("../services/passwordResetEmail.service");
const { generateAuthToken, normalizeEmail, normalizePhone } = require("../utils/auth.utils");

const PASSWORD_RESET_TOKEN_TTL_MS = 15 * 60 * 1000;
const PASSWORD_RESET_MESSAGE =
  "If an account exists for that email, we will send a reset link if email delivery is available. If you do not receive it, please try again later.";

// Login existing user
exports.login = async (req, res, next) => {
  try {
    const body = req.body || {};
    const identifier = body.identifier || body.email || body.phone;
    const { password } = body;

    if (
      typeof identifier !== "string" ||
      !identifier.trim() ||
      typeof password !== "string" ||
      !password
    ) {
      return res.status(400).json({
        success: false,
        message: "Email/mobile number and password are required",
      });
    }

    const isEmail = identifier.includes("@");
    let user;

    if (isEmail) {
      user = await User.findOne({
        email: normalizeEmail(identifier),
      }).select("+password");
    } else {
      const phone = normalizePhone(identifier, { allowLocalIndianNumber: true });

      if (phone) {
        user = await User.findOne({ phoneClaim: phone }).select("+password +phoneClaim");

        if (!user) {
          const legacyUsers = await User.find({
            phone: { $type: "string" },
            phoneVerified: true,
          }).select("_id phone").lean();
          const legacyMatch = legacyUsers.find(
            (candidate) => normalizePhone(candidate.phone, { allowLocalIndianNumber: true }) === phone
          );
          if (legacyMatch) {
            user = await User.findById(legacyMatch._id).select("+password");
          }
        }
      }
    }

    if (user && user.registrationStatus === "pending") {
      return res.status(403).json({
        success: false,
        message: "Verify your email address and mobile number before logging in.",
      });
    }

    if (
      !user ||
      (!isEmail && user.phoneVerified !== true) ||
      !(await user.comparePassword(password))
    ) {
      return res.status(401).json({
        success: false,
        message: "Invalid email/mobile number or password",
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: "Your account is inactive",
      });
    }

    const token = generateAuthToken(user);

    res.json({
      success: true,
      message: "Login successful",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone || null,
        emailVerified: user.emailVerified === true,
        phoneVerified: user.phoneVerified === true,
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.requestPasswordReset = async (req, res, next) => {
  try {
    if (!passwordResetEmail.isConfigured()) {
      return res.status(503).json({
        success: false,
        message: "Password reset email is not configured. Please contact support.",
      });
    }

    const emailValue = req.body && req.body.email;
    const email = typeof emailValue === "string"
      ? emailValue.trim().toLowerCase()
      : "";

    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid email address.",
      });
    }

    const user = await User.findOne({ email }).select(
      "+passwordResetTokenHash +passwordResetExpiresAt"
    );

    if (user && user.isActive) {
      const token = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

      user.passwordResetTokenHash = tokenHash;
      user.passwordResetExpiresAt = new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS);
      await user.save();

      try {
        const resetUrl = passwordResetEmail.createResetUrl(token);
        await passwordResetEmail.sendPasswordResetEmail({
          email: user.email,
          resetUrl,
        });
      } catch {
        console.error("Password reset email delivery failed.");

        try {
          await User.updateOne(
            { _id: user._id, passwordResetTokenHash: tokenHash },
            { $unset: { passwordResetTokenHash: 1, passwordResetExpiresAt: 1 } }
          );
        } catch {
          console.error("Could not clear an undelivered password reset token.");
        }
      }
    }

    return res.status(202).json({
      success: true,
      message: PASSWORD_RESET_MESSAGE,
    });
  } catch (error) {
    next(error);
  }
};

exports.resetPassword = async (req, res, next) => {
  try {
    const { token, password } = req.body || {};

    if (typeof token !== "string" || !/^[a-f0-9]{64}$/i.test(token)) {
      return res.status(400).json({
        success: false,
        message: "This password reset link is invalid or has expired.",
      });
    }

    if (typeof password !== "string" || password.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters.",
      });
    }

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const now = new Date();
    const user = await User.findOne({
      passwordResetTokenHash: tokenHash,
      passwordResetExpiresAt: { $gt: now },
      isActive: true,
    }).select("_id");

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "This password reset link is invalid or has expired.",
      });
    }

    const hashedPassword = await User.hashPassword(password);
    const updatedUser = await User.findOneAndUpdate(
      {
        _id: user._id,
        passwordResetTokenHash: tokenHash,
        passwordResetExpiresAt: { $gt: new Date() },
        isActive: true,
      },
      {
        $set: { password: hashedPassword },
        $unset: { passwordResetTokenHash: 1, passwordResetExpiresAt: 1 },
      },
      { runValidators: true }
    );

    if (!updatedUser) {
      return res.status(400).json({
        success: false,
        message: "This password reset link is invalid or has expired.",
      });
    }

    return res.json({
      success: true,
      message: "Your password has been updated. You can now log in.",
    });
  } catch (error) {
    next(error);
  }
};
