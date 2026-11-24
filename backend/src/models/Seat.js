
const mongoose = require("mongoose");

const seatSchema = new mongoose.Schema(
  {
    screen: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Screen",
      required: true,
      index: true,
    },

    rowLabel: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 5,
    },

    seatNumber: {
      type: Number,
      required: true,
      min: 1,
    },

    seatCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },

    seatType: {
      type: String,
      enum: ["regular", "premium", "recliner"],
      default: "regular",
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

// Prevent duplicate seats in the same screen
seatSchema.index(
  { screen: 1, rowLabel: 1, seatNumber: 1 },
  { unique: true }
);

seatSchema.index(
  { screen: 1, seatCode: 1 },
  { unique: true }
);

module.exports = mongoose.model("Seat", seatSchema);
