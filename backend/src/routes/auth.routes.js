
const express = require("express");
const rateLimit = require("express-rate-limit");
const authController = require("../controllers/auth.controller");
const registrationController = require("../controllers/registration.controller");
const authMiddleware = require("../middlewares/auth.middleware");
const User = require("../models/User");

const router = express.Router();
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: {
    success: false,
    message: "Too many login attempts. Please wait 15 minutes before trying again.",
  },
});
const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many password reset attempts. Please try again later.",
  },
});
const otpRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many verification code requests. Please try again later.",
  },
});
const otpVerificationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many verification attempts. Please try again later.",
  },
});

router.post("/register", otpRequestLimiter, registrationController.register);
router.post("/login", loginLimiter, authController.login);
router.post("/resend-registration-otp", otpRequestLimiter, registrationController.resendRegistrationOtp);
router.post("/verify-registration-otp", otpVerificationLimiter, registrationController.verifyRegistrationOtp);
router.post("/mobile/request-verification", authMiddleware, otpRequestLimiter, registrationController.requestMobileVerification);
router.post("/mobile/resend-verification", authMiddleware, otpRequestLimiter, registrationController.resendMobileVerification);
router.post("/mobile/verify", authMiddleware, otpVerificationLimiter, registrationController.verifyMobileNumber);
router.post("/forgot-password", passwordResetLimiter, authController.requestPasswordReset);
router.post("/reset-password", passwordResetLimiter, authController.resetPassword);

// Protected user profile route
router.get("/me", authMiddleware, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select("+pendingPhone +phoneOtpResendAt");

    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: "Invalid or inactive account",
      });
    }

    return res.json({
      success: true,
      message: "Authenticated user",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone || null,
        phoneVerified: user.phoneVerified === true,
        emailVerified: user.emailVerified === true,
        pendingPhone: user.pendingPhone || null,
        phoneOtpResendAt: user.phoneOtpResendAt || null,
      },
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
