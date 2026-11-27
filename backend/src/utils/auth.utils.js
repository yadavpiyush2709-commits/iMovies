const crypto = require("crypto");
const jwt = require("jsonwebtoken");

function normalizeEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizePhone(value, { allowLocalIndianNumber = false } = {}) {
  if (typeof value !== "string") {
    return null;
  }

  let compact = value.trim().replace(/[\s().-]/g, "");
  if (compact.startsWith("00")) {
    compact = `+${compact.slice(2)}`;
  }

  if (/^\+[1-9]\d{7,14}$/.test(compact)) {
    return compact;
  }

  if (allowLocalIndianNumber && /^[6-9]\d{9}$/.test(compact)) {
    return `+91${compact}`;
  }

  if (allowLocalIndianNumber && /^0[6-9]\d{9}$/.test(compact)) {
    return `+91${compact.slice(1)}`;
  }

  if (allowLocalIndianNumber && /^91[6-9]\d{9}$/.test(compact)) {
    return `+${compact}`;
  }

  return null;
}

function normalizeStoredPhone(value) {
  return normalizePhone(value, { allowLocalIndianNumber: true });
}

function generateOtp() {
  return crypto.randomInt(0, 1000000).toString().padStart(6, "0");
}

function generateAuthToken(user) {
  return jwt.sign(
    {
      id: user._id,
      role: user.role,
    },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function hashOtp(userId, channel, otp) {
  return crypto
    .createHmac("sha256", process.env.JWT_SECRET)
    .update(`${userId}:${channel}:${otp}`)
    .digest("hex");
}

function otpMatches(userId, channel, otp, storedHash) {
  if (typeof otp !== "string" || !/^\d{6}$/.test(otp) || typeof storedHash !== "string") {
    return false;
  }

  const expected = Buffer.from(hashOtp(userId, channel, otp), "hex");
  const stored = Buffer.from(storedHash, "hex");
  return expected.length === stored.length && crypto.timingSafeEqual(expected, stored);
}

module.exports = {
  generateOtp,
  generateAuthToken,
  hashOtp,
  normalizeEmail,
  normalizePhone,
  normalizeStoredPhone,
  otpMatches,
};
