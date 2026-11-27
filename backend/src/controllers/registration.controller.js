const User = require("../models/User");
const emailService = require("../services/passwordResetEmail.service");
const smsService = require("../services/sms.service");
const {
  generateAuthToken,
  generateOtp,
  hashOtp,
  normalizeEmail,
  normalizePhone,
  normalizeStoredPhone,
  otpMatches,
} = require("../utils/auth.utils");

const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_RESEND_COOLDOWN_MS = 45 * 1000;
const MAX_OTP_ATTEMPTS = 5;
const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;

const otpFields = {
  email: {
    prefix: "email",
    verified: "emailVerified",
  },
  mobile: {
    prefix: "phone",
    verified: "phoneVerified",
  },
};

function publicUser(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    phone: user.phone || null,
    emailVerified: user.emailVerified === true,
    phoneVerified: user.phoneVerified === true,
    registrationStatus: user.registrationStatus,
  };
}

function retryAfterSeconds(date) {
  return Math.max(1, Math.ceil((date.getTime() - Date.now()) / 1000));
}

function cooldownAvailableFilter(path, now) {
  return {
    $or: [
      { [path]: { $exists: false } },
      { [path]: null },
      { [path]: { $lte: now } },
    ],
  };
}

function providerConfigured(channel) {
  return channel === "email" ? emailService.isConfigured() : smsService.isConfigured();
}

function providerSetupMessage(channel) {
  return channel === "email"
    ? "Email OTP delivery is not configured. Configure RESEND_API_KEY, EMAIL_FROM, and CLIENT_URL."
    : "SMS OTP delivery is not configured. Configure SMS_PROVIDER, SMS_API_KEY, SMS_API_SECRET, and SMS_SENDER_ID.";
}

function deliverOtp(channel, destination, otp) {
  return channel === "email"
    ? emailService.sendRegistrationOtpEmail({ email: destination, otp })
    : smsService.sendMobileOtp({ phone: destination, otp });
}

async function hasPhoneConflict(phone, excludedUserId = null) {
  const claimedQuery = { phoneClaim: phone };
  if (excludedUserId) {
    claimedQuery._id = { $ne: excludedUserId };
  }

  if (await User.exists(claimedQuery)) {
    return true;
  }

  const legacyQuery = { phone: { $type: "string" } };
  if (excludedUserId) {
    legacyQuery._id = { $ne: excludedUserId };
  }

  const legacyUsers = await User.find(legacyQuery).select("_id phone").lean();
  return legacyUsers.some(
    (user) => normalizeStoredPhone(user.phone) === phone
  );
}

function isDuplicateKeyError(error) {
  return Boolean(error && error.code === 11000);
}

exports.register = async (req, res, next) => {
  try {
    const body = req.body || {};
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const email = normalizeEmail(body.email);
    const phone = normalizePhone(body.phone);
    const password = body.password;
    const confirmPassword = body.confirmPassword;

    if (name.length < 2 || name.length > 100) {
      return res.status(400).json({
        success: false,
        message: "Full name must be between 2 and 100 characters.",
      });
    }

    if (!EMAIL_PATTERN.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid email address.",
      });
    }

    if (!phone) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid mobile number in international format, including its country code.",
      });
    }

    if (typeof password !== "string" || password.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters.",
      });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "The passwords do not match.",
      });
    }

    if (!emailService.isConfigured()) {
      return res.status(503).json({
        success: false,
        message: providerSetupMessage("email"),
      });
    }

    if (!smsService.isConfigured()) {
      return res.status(503).json({
        success: false,
        message: providerSetupMessage("mobile"),
      });
    }

    if (await User.exists({ email })) {
      return res.status(409).json({
        success: false,
        message: "An account with that email address already exists.",
      });
    }

    if (await hasPhoneConflict(phone)) {
      return res.status(409).json({
        success: false,
        message: "An account with that mobile number already exists.",
      });
    }

    const user = new User({
      name,
      email,
      phone,
      phoneClaim: phone,
      password,
      role: "customer",
      isActive: false,
      registrationStatus: "pending",
      emailVerified: false,
      phoneVerified: false,
    });

    const emailOtp = generateOtp();
    const phoneOtp = generateOtp();
    const now = new Date();
    user.emailOtpHash = hashOtp(user._id, "email", emailOtp);
    user.emailOtpExpiresAt = new Date(now.getTime() + OTP_TTL_MS);
    user.emailOtpAttempts = 0;
    user.emailOtpResendAt = new Date(now.getTime() + OTP_RESEND_COOLDOWN_MS);
    user.phoneOtpHash = hashOtp(user._id, "phone", phoneOtp);
    user.phoneOtpExpiresAt = new Date(now.getTime() + OTP_TTL_MS);
    user.phoneOtpAttempts = 0;
    user.phoneOtpResendAt = new Date(now.getTime() + OTP_RESEND_COOLDOWN_MS);
    await user.save();

    const deliveryResults = await Promise.allSettled([
      Promise.resolve().then(() => deliverOtp("email", email, emailOtp)),
      Promise.resolve().then(() => deliverOtp("mobile", phone, phoneOtp)),
    ]);

    return res.status(201).json({
      success: true,
      message: "Registration is pending. Verify both contact methods before signing in.",
      registration: {
        email,
        phone,
        emailVerified: false,
        phoneVerified: false,
        delivery: {
          email: deliveryResults[0].status === "fulfilled" ? "accepted" : "failed",
          mobile: deliveryResults[1].status === "fulfilled" ? "accepted" : "failed",
        },
        resendAfterSeconds: Math.floor(OTP_RESEND_COOLDOWN_MS / 1000),
      },
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return res.status(409).json({
        success: false,
        message: "An account with that email address or mobile number already exists.",
      });
    }
    next(error);
  }
};

exports.resendRegistrationOtp = async (req, res, next) => {
  try {
    const body = req.body || {};
    const email = normalizeEmail(body.email);
    const channel = body.channel;

    if (!EMAIL_PATTERN.test(email) || !otpFields[channel]) {
      return res.status(400).json({
        success: false,
        message: "A valid email address and verification channel are required.",
      });
    }

    if (!providerConfigured(channel)) {
      return res.status(503).json({
        success: false,
        message: providerSetupMessage(channel),
      });
    }

    const user = await User.findOne({ email, registrationStatus: "pending" }).select(
      "+emailOtpHash +emailOtpExpiresAt +emailOtpAttempts +emailOtpResendAt +phoneOtpHash +phoneOtpExpiresAt +phoneOtpAttempts +phoneOtpResendAt"
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "No pending registration was found for that email address.",
      });
    }

    const fields = otpFields[channel];
    if (user[fields.verified] === true) {
      return res.status(409).json({
        success: false,
        message: `The ${channel === "email" ? "email" : "mobile"} number is already verified.`,
      });
    }

    const prefix = fields.prefix;
    const resendField = `${prefix}OtpResendAt`;
    const existingResendAt = user[resendField];
    const now = new Date();

    if (existingResendAt && existingResendAt > now) {
      return res.status(429).json({
        success: false,
        retryAfterSeconds: retryAfterSeconds(existingResendAt),
        message: "Please wait before requesting another code.",
      });
    }

    const otp = generateOtp();
    const destination = channel === "email" ? user.email : user.phone;
    const nextResendAt = new Date(now.getTime() + OTP_RESEND_COOLDOWN_MS);
    const updatedUser = await User.findOneAndUpdate(
      {
        _id: user._id,
        registrationStatus: "pending",
        [fields.verified]: { $ne: true },
        ...cooldownAvailableFilter(resendField, now),
      },
      {
        $set: {
          [`${prefix}OtpHash`]: hashOtp(user._id, prefix, otp),
          [`${prefix}OtpExpiresAt`]: new Date(now.getTime() + OTP_TTL_MS),
          [`${prefix}OtpAttempts`]: 0,
          [resendField]: nextResendAt,
        },
      },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(429).json({
        success: false,
        retryAfterSeconds: Math.floor(OTP_RESEND_COOLDOWN_MS / 1000),
        message: "Please wait before requesting another code.",
      });
    }

    try {
      await deliverOtp(channel, destination, otp);
    } catch {
      return res.status(502).json({
        success: false,
        retryAfterSeconds: Math.floor(OTP_RESEND_COOLDOWN_MS / 1000),
        message: `Unable to send the ${channel === "email" ? "email" : "SMS"} code right now. Please try again later.`,
      });
    }

    return res.json({
      success: true,
      delivery: "accepted",
      resendAfterSeconds: Math.floor(OTP_RESEND_COOLDOWN_MS / 1000),
      message: "The provider accepted the new verification request.",
    });
  } catch (error) {
    next(error);
  }
};

async function verifyOtp(user, channel, otp, { registrationOnly = false, profilePhone = false } = {}) {
  const fields = otpFields[channel];
  const prefix = fields.prefix;
  const hashField = `${prefix}OtpHash`;
  const expiresField = `${prefix}OtpExpiresAt`;
  const attemptsField = `${prefix}OtpAttempts`;
  const currentHash = user[hashField];
  const now = new Date();
  const scope = registrationOnly ? { registrationStatus: "pending" } : { isActive: true };

  if (user[fields.verified] === true) {
    return { error: { status: 409, message: "This verification step is already complete." } };
  }

  if (!currentHash || !user[expiresField] || user[expiresField] <= now) {
    if (currentHash) {
      await User.updateOne(
        { _id: user._id, [hashField]: currentHash },
        { $unset: { [hashField]: 1, [expiresField]: 1 } }
      );
    }
    return { error: { status: 410, message: "This code has expired. Request a new one." } };
  }

  if (user[attemptsField] >= MAX_OTP_ATTEMPTS) {
    return { error: { status: 429, message: "Too many incorrect codes. Request a new code." } };
  }

  if (!otpMatches(user._id, prefix, otp, currentHash)) {
    const attemptUpdate = await User.updateOne(
      {
        _id: user._id,
        ...scope,
        [hashField]: currentHash,
        [expiresField]: { $gt: now },
        [attemptsField]: { $lt: MAX_OTP_ATTEMPTS },
      },
      { $inc: { [attemptsField]: 1 } }
    );

    if (!attemptUpdate.modifiedCount || user[attemptsField] + 1 >= MAX_OTP_ATTEMPTS) {
      return { error: { status: 429, message: "Too many incorrect codes. Request a new code." } };
    }

    return { error: { status: 400, message: "The verification code is incorrect." } };
  }

  const update = {
    $set: {
      [fields.verified]: true,
      [attemptsField]: 0,
      ...(profilePhone ? { phone: user.pendingPhone } : {}),
    },
    $unset: {
      [hashField]: 1,
      [expiresField]: 1,
      ...(profilePhone ? { pendingPhone: 1 } : {}),
    },
  };
  const verifiedUser = await User.findOneAndUpdate(
    {
      _id: user._id,
      ...scope,
      ...(profilePhone ? { pendingPhone: user.pendingPhone } : {}),
      [fields.verified]: { $ne: true },
      [hashField]: currentHash,
      [expiresField]: { $gt: new Date() },
      [attemptsField]: { $lt: MAX_OTP_ATTEMPTS },
    },
    update,
    { new: true }
  );

  if (!verifiedUser) {
    return { error: { status: 400, message: "This code has expired or has already been used." } };
  }

  return { user: verifiedUser };
}

exports.verifyRegistrationOtp = async (req, res, next) => {
  try {
    const body = req.body || {};
    const email = normalizeEmail(body.email);
    const channel = body.channel;
    const otp = body.otp;

    if (!EMAIL_PATTERN.test(email) || !otpFields[channel] || typeof otp !== "string" || !/^\d{6}$/.test(otp)) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid email address, verification channel, and six-digit code.",
      });
    }

    const user = await User.findOne({ email, registrationStatus: "pending" }).select(
      "+emailOtpHash +emailOtpExpiresAt +emailOtpAttempts +phoneOtpHash +phoneOtpExpiresAt +phoneOtpAttempts"
    );
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "No pending registration was found for that email address.",
      });
    }

    const result = await verifyOtp(user, channel, otp, { registrationOnly: true });
    if (result.error) {
      return res.status(result.error.status).json({
        success: false,
        message: result.error.message,
      });
    }

    let updatedUser = result.user;
    if (updatedUser.emailVerified === true && updatedUser.phoneVerified === true) {
      updatedUser = await User.findOneAndUpdate(
        {
          _id: updatedUser._id,
          registrationStatus: "pending",
          emailVerified: true,
          phoneVerified: true,
        },
        { $set: { registrationStatus: "active", isActive: true } },
        { new: true }
      ) || await User.findById(updatedUser._id);
    }

    const accountActive =
      updatedUser.registrationStatus === "active" && updatedUser.isActive === true;
    const response = {
      success: true,
      message: accountActive
        ? "Both contact methods are verified. Your account is active."
        : `${channel === "email" ? "Email" : "Mobile"} verified. Verify the other contact method to activate your account.`,
      verification: {
        emailVerified: updatedUser.emailVerified === true,
        phoneVerified: updatedUser.phoneVerified === true,
        accountActive,
      },
    };

    if (accountActive) {
      response.token = generateAuthToken(updatedUser);
      response.user = publicUser(updatedUser);
    }

    return res.json(response);
  } catch (error) {
    next(error);
  }
};

exports.requestMobileVerification = async (req, res, next) => {
  try {
    if (!smsService.isConfigured()) {
      return res.status(503).json({
        success: false,
        message: providerSetupMessage("mobile"),
      });
    }

    const body = req.body || {};
    const phone = normalizePhone(body.phone);
    if (!phone) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid mobile number in international format, including its country code.",
      });
    }

    const user = await User.findById(req.user.id).select(
      "+phoneClaim +pendingPhone +phoneOtpHash +phoneOtpExpiresAt +phoneOtpAttempts +phoneOtpResendAt"
    );
    if (!user) {
      return res.status(404).json({ success: false, message: "Account not found." });
    }

    if (user.phoneVerified === true) {
      return res.status(409).json({
        success: false,
        message: "A verified mobile number is already linked to this account.",
      });
    }

    if (await hasPhoneConflict(phone, user._id)) {
      return res.status(409).json({
        success: false,
        message: "That mobile number is already linked to another account.",
      });
    }

    const now = new Date();
    if (user.phoneOtpResendAt && user.phoneOtpResendAt > now) {
      return res.status(429).json({
        success: false,
        retryAfterSeconds: retryAfterSeconds(user.phoneOtpResendAt),
        message: "Please wait before requesting another code.",
      });
    }

    const otp = generateOtp();
    const resendAt = new Date(now.getTime() + OTP_RESEND_COOLDOWN_MS);
    const updatedUser = await User.findOneAndUpdate(
      {
        _id: user._id,
        phoneVerified: { $ne: true },
        ...cooldownAvailableFilter("phoneOtpResendAt", now),
      },
      {
        $set: {
          pendingPhone: phone,
          phoneClaim: phone,
          phoneOtpHash: hashOtp(user._id, "phone", otp),
          phoneOtpExpiresAt: new Date(now.getTime() + OTP_TTL_MS),
          phoneOtpAttempts: 0,
          phoneOtpResendAt: resendAt,
        },
      },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(429).json({
        success: false,
        retryAfterSeconds: Math.floor(OTP_RESEND_COOLDOWN_MS / 1000),
        message: "Please wait before requesting another code.",
      });
    }

    try {
      await smsService.sendMobileOtp({ phone, otp });
    } catch {
      return res.status(502).json({
        success: false,
        retryAfterSeconds: Math.floor(OTP_RESEND_COOLDOWN_MS / 1000),
        message: "Unable to send the SMS code right now. Please try again later.",
      });
    }

    return res.json({
      success: true,
      pendingPhone: phone,
      resendAfterSeconds: Math.floor(OTP_RESEND_COOLDOWN_MS / 1000),
      message: "The SMS provider accepted the verification request.",
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return res.status(409).json({
        success: false,
        message: "That mobile number is already linked to another account.",
      });
    }
    next(error);
  }
};

exports.resendMobileVerification = async (req, res, next) => {
  try {
    if (!smsService.isConfigured()) {
      return res.status(503).json({
        success: false,
        message: providerSetupMessage("mobile"),
      });
    }

    const user = await User.findById(req.user.id).select(
      "+pendingPhone +phoneOtpHash +phoneOtpExpiresAt +phoneOtpAttempts +phoneOtpResendAt"
    );
    if (!user || !user.pendingPhone || user.phoneVerified === true) {
      return res.status(400).json({
        success: false,
        message: "There is no pending mobile verification for this account.",
      });
    }

    const now = new Date();
    if (user.phoneOtpResendAt && user.phoneOtpResendAt > now) {
      return res.status(429).json({
        success: false,
        retryAfterSeconds: retryAfterSeconds(user.phoneOtpResendAt),
        message: "Please wait before requesting another code.",
      });
    }

    const otp = generateOtp();
    const resendAt = new Date(now.getTime() + OTP_RESEND_COOLDOWN_MS);
    const updatedUser = await User.findOneAndUpdate(
      {
        _id: user._id,
        phoneVerified: { $ne: true },
        pendingPhone: user.pendingPhone,
        ...cooldownAvailableFilter("phoneOtpResendAt", now),
      },
      {
        $set: {
          phoneOtpHash: hashOtp(user._id, "phone", otp),
          phoneOtpExpiresAt: new Date(now.getTime() + OTP_TTL_MS),
          phoneOtpAttempts: 0,
          phoneOtpResendAt: resendAt,
        },
      },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(429).json({
        success: false,
        retryAfterSeconds: Math.floor(OTP_RESEND_COOLDOWN_MS / 1000),
        message: "Please wait before requesting another code.",
      });
    }

    try {
      await smsService.sendMobileOtp({ phone: user.pendingPhone, otp });
    } catch {
      return res.status(502).json({
        success: false,
        retryAfterSeconds: Math.floor(OTP_RESEND_COOLDOWN_MS / 1000),
        message: "Unable to send the SMS code right now. Please try again later.",
      });
    }

    return res.json({
      success: true,
      pendingPhone: user.pendingPhone,
      resendAfterSeconds: Math.floor(OTP_RESEND_COOLDOWN_MS / 1000),
      message: "The SMS provider accepted the new verification request.",
    });
  } catch (error) {
    next(error);
  }
};

exports.verifyMobileNumber = async (req, res, next) => {
  try {
    const body = req.body || {};
    const otp = body.otp;
    if (typeof otp !== "string" || !/^\d{6}$/.test(otp)) {
      return res.status(400).json({
        success: false,
        message: "Enter the six-digit verification code.",
      });
    }

    const user = await User.findById(req.user.id).select(
      "+pendingPhone +phoneOtpHash +phoneOtpExpiresAt +phoneOtpAttempts"
    );
    if (!user || !user.pendingPhone) {
      return res.status(400).json({
        success: false,
        message: "There is no pending mobile verification for this account.",
      });
    }

    const result = await verifyOtp(user, "mobile", otp, {
      profilePhone: true,
    });
    if (result.error) {
      return res.status(result.error.status).json({
        success: false,
        message: result.error.message,
      });
    }

    return res.json({
      success: true,
      message: "Your mobile number is verified.",
      user: publicUser(result.user),
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return res.status(409).json({
        success: false,
        message: "That mobile number is already linked to another account.",
      });
    }
    next(error);
  }
};
