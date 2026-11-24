const mongoose = require("mongoose");

const showSeatSchema = new mongoose.Schema(
  {
    show: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Show",
      required: true,
      index: true,
    },

    seat: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Seat",
      required: true,
    },

    status: {
      type: String,
      enum: ["available", "locked", "booked"],
      default: "available",
      index: true,
    },

    lockedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    lockExpiresAt: {
      type: Date,
      default: null,
    },

    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// One seat can have only one record per show
showSeatSchema.index(
  { show: 1, seat: 1 },
  { unique: true }
);

module.exports = mongoose.model("ShowSeat", showSeatSchema);