
const mongoose = require("mongoose");

const screenSchema = new mongoose.Schema(
  {
    theatre: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Theatre",
      required: true,
      index: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },

    screenType: {
      type: String,
      enum: ["standard", "imax", "4dx", "dolby_cinema", "other"],
      default: "standard",
    },

    totalRows: {
      type: Number,
      required: true,
      min: 1,
      max: 100,
    },

    seatsPerRow: {
      type: Number,
      required: true,
      min: 1,
      max: 100,
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Prevent duplicate screen names inside the same theatre
screenSchema.index(
  { theatre: 1, name: 1 },
  { unique: true }
);

module.exports = mongoose.model("Screen", screenSchema);
