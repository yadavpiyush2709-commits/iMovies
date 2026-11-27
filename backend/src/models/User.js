
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      maxlength: 100,
    },

    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Please enter a valid email"],
    },

    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: 8,
      select: false,
    },

    role: {
      type: String,
      enum: ["customer", "admin", "theatre_owner"],
      default: "customer",
    },

    phone: {
      type: String,
      trim: true,
      default: null,
    },

    phoneClaim: {
      type: String,
      select: false,
    },

    pendingPhone: {
      type: String,
      select: false,
    },

    registrationStatus: {
      type: String,
      enum: ["active", "pending"],
      default: "active",
    },

    emailVerified: {
      type: Boolean,
    },

    phoneVerified: {
      type: Boolean,
    },

    emailOtpHash: {
      type: String,
      select: false,
    },

    emailOtpExpiresAt: {
      type: Date,
      select: false,
    },

    emailOtpAttempts: {
      type: Number,
      default: 0,
      select: false,
    },

    emailOtpResendAt: {
      type: Date,
      select: false,
    },

    phoneOtpHash: {
      type: String,
      select: false,
    },

    phoneOtpExpiresAt: {
      type: Date,
      select: false,
    },

    phoneOtpAttempts: {
      type: Number,
      default: 0,
      select: false,
    },

    phoneOtpResendAt: {
      type: Date,
      select: false,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    passwordResetTokenHash: {
      type: String,
      select: false,
    },

    passwordResetExpiresAt: {
      type: Date,
      select: false,
    },
  },
  {
    timestamps: true,
  }
);

userSchema.index(
  { phoneClaim: 1 },
  {
    unique: true,
    partialFilterExpression: { phoneClaim: { $type: "string" } },
  }
);

// Hash password before saving
userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;

  this.password = await this.constructor.hashPassword(this.password);
});

userSchema.statics.hashPassword = async function (password) {
  const salt = await bcrypt.genSalt(12);
  return bcrypt.hash(password, salt);
};

// Compare entered password with stored hash
userSchema.methods.comparePassword = async function (enteredPassword) {
  return bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model("User", userSchema);
