
const mongoose = require("mongoose");

const movieSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },

    description: {
      type: String,
      required: true,
      trim: true,
    },

    poster: {
      type: String,
      default: "",
    },

    backdrop: {
      type: String,
      default: "",
    },

    trailerUrl: {
      type: String,
      default: "",
    },

    genres: [{
      type: String,
      trim: true,
    }],

    durationMinutes: {
      type: Number,
      required: true,
      min: 1,
    },

    releaseDate: {
      type: Date,
      required: true,
    },

    certification: {
      type: String,
      default: "Not Rated",
      trim: true,
    },

    languages: [{
      type: String,
      trim: true,
    }],

    formats: [{
      type: String,
      enum: ["2D", "3D", "IMAX", "4DX", "Other"],
    }],

    cast: [{
      name: { type: String, trim: true },
      character: { type: String, trim: true },
    }],

    director: {
      type: String,
      trim: true,
      default: "",
    },

    status: {
      type: String,
      enum: ["upcoming", "now_showing", "ended"],
      default: "upcoming",
      index: true,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

movieSchema.index({ title: "text", description: "text" });

module.exports = mongoose.model("Movie", movieSchema);
