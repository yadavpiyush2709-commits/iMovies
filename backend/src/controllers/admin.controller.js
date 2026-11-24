
const Theatre = require("../models/Theatre");
const User = require("../models/User");
const Movie = require("../models/Movie");

// Get all pending theatre applications
exports.getPendingTheatres = async (req, res, next) => {
  try {
    const applications = await Theatre.find({
      approvalStatus: "pending",
    })
      .populate("owner", "name email")
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: applications.length,
      applications,
    });
  } catch (error) {
    next(error);
  }
};

// Approve a theatre application
exports.approveTheatre = async (req, res, next) => {
  try {
    const theatre = await Theatre.findById(req.params.id);

    if (!theatre) {
      return res.status(404).json({
        success: false,
        message: "Theatre application not found",
      });
    }

    if (theatre.approvalStatus !== "pending") {
      return res.status(409).json({
        success: false,
        message: "Application has already been reviewed",
      });
    }

    const owner = await User.findById(theatre.owner);

    if (!owner || !owner.isActive) {
      return res.status(400).json({
        success: false,
        message: "Theatre owner account is unavailable",
      });
    }

    theatre.approvalStatus = "approved";
    theatre.approvedBy = req.user.id;
    theatre.approvedAt = new Date();
    theatre.rejectionReason = "";

    await theatre.save();

    owner.role = "theatre_owner";
    await owner.save();

    res.json({
      success: true,
      message: "Theatre application approved",
      theatre,
    });
  } catch (error) {
    next(error);
  }
};

// Reject a theatre application
exports.rejectTheatre = async (req, res, next) => {
  try {
    const { reason } = req.body;

    if (!reason || !reason.trim()) {
      return res.status(400).json({
        success: false,
        message: "Rejection reason is required",
      });
    }

    const theatre = await Theatre.findById(req.params.id);

    if (!theatre) {
      return res.status(404).json({
        success: false,
        message: "Theatre application not found",
      });
    }

    if (theatre.approvalStatus !== "pending") {
      return res.status(409).json({
        success: false,
        message: "Application has already been reviewed",
      });
    }

    theatre.approvalStatus = "rejected";
    theatre.rejectionReason = reason.trim();
    theatre.approvedBy = req.user.id;

    await theatre.save();

    res.json({
      success: true,
      message: "Theatre application rejected",
      theatre,
    });
  } catch (error) {
    next(error);
  }
};

// Create a new movie
exports.createMovie = async (req, res, next) => {
  try {
    const {
      title,
      description,
      poster,
      backdrop,
      trailerUrl,
      genres,
      durationMinutes,
      releaseDate,
      certification,
      languages,
      formats,
      cast,
      director,
    } = req.body;

    if (!title || !description || !durationMinutes || !releaseDate) {
      return res.status(400).json({
        success: false,
        message: "Title, description, duration and release date are required",
      });
    }

    if (
      !Number.isInteger(durationMinutes) ||
      durationMinutes < 1
    ) {
      return res.status(400).json({
        success: false,
        message: "Duration must be a positive whole number",
      });
    }

    const parsedReleaseDate = new Date(releaseDate);

    if (Number.isNaN(parsedReleaseDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid release date",
      });
    }

    const movie = await Movie.create({
      title,
      description,
      poster,
      backdrop,
      trailerUrl,
      genres,
      durationMinutes,
      releaseDate: parsedReleaseDate,
      certification,
      languages,
      formats,
      cast,
      director,
      createdBy: req.user.id,
    });

    res.status(201).json({
      success: true,
      message: "Movie created successfully",
      movie,
    });
  } catch (error) {
    next(error);
  }
};