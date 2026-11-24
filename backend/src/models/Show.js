
const mongoose = require("mongoose");

const showSchema = new mongoose.Schema(
  {
    movie: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Movie",
      required: true,
      index: true,
    },

    theatre: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Theatre",
      required: true,
      index: true,
    },

    screen: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Screen",
      required: true,
      index: true,
    },

    showDate: {
      type: Date,
      required: true,
    },

    startTime: {
      type: Date,
      required: true,
    },

    endTime: {
      type: Date,
      required: true,
    },

    language: {
      type: String,
      trim: true,
      default: "Hindi",
    },

    format: {
      type: String,
      enum: ["2D", "3D", "IMAX", "4DX", "Other"],
      default: "2D",
    },

    seatPricing: {
      regular: {
        type: Number,
        required: true,
        min: 0,
      },

      premium: {
        type: Number,
        required: true,
        min: 0,
      },

      recliner: {
        type: Number,
        required: true,
        min: 0,
      },
    },

    status: {
      type: String,
      enum: ["scheduled", "cancelled", "completed"],
      default: "scheduled",
      index: true,
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

// Help find shows by theatre, screen and date
showSchema.index({
  theatre: 1,
  screen: 1,
  showDate: 1,
});

module.exports = mongoose.model("Show", showSchema);
