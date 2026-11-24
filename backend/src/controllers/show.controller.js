const Show = require("../models/Show");
const Movie = require("../models/Movie");
const Theatre = require("../models/Theatre");
const Screen = require("../models/Screen");

// Create a new show
exports.createShow = async (req, res, next) => {
  try {
    const {
      movieId,
      theatreId,
      screenId,
      startTime,
      endTime,
      language,
      format,
      seatPricing,
    } = req.body;

    // Validate required fields
    if (
      !movieId ||
      !theatreId ||
      !screenId ||
      !startTime ||
      !endTime ||
      !seatPricing
    ) {
      return res.status(400).json({
        success: false,
        message: "All required show details must be provided",
      });
    }

    // Validate IDs
    if (
      !require("mongoose").isValidObjectId(movieId) ||
      !require("mongoose").isValidObjectId(theatreId) ||
      !require("mongoose").isValidObjectId(screenId)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid movie, theatre or screen ID",
      });
    }

    // Validate date and time
    const start = new Date(startTime);
    const end = new Date(endTime);

    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime()) ||
      end <= start
    ) {
      return res.status(400).json({
        success: false,
        message: "Please provide valid show start and end times",
      });
    }

    if (start <= new Date()) {
      return res.status(400).json({
        success: false,
        message: "Show must be scheduled for a future time",
      });
    }

    // Validate pricing
    const priceTypes = ["regular", "premium", "recliner"];

    for (const type of priceTypes) {
      if (
        typeof seatPricing[type] !== "number" ||
        !Number.isFinite(seatPricing[type]) ||
        seatPricing[type] < 0
      ) {
        return res.status(400).json({
          success: false,
          message: `Valid ${type} seat pricing is required`,
        });
      }
    }

    // Check movie
    const movie = await Movie.findOne({
      _id: movieId,
      isActive: true,
    });

    if (!movie) {
      return res.status(404).json({
        success: false,
        message: "Movie not found or inactive",
      });
    }

    // Check theatre ownership and approval
    const theatre = await Theatre.findOne({
      _id: theatreId,
      owner: req.user.id,
      approvalStatus: "approved",
      isActive: true,
    });

    if (!theatre) {
      return res.status(403).json({
        success: false,
        message: "You cannot schedule shows for this theatre",
      });
    }

    // Check screen belongs to the theatre
    const screen = await Screen.findOne({
      _id: screenId,
      theatre: theatreId,
      isActive: true,
    });

    if (!screen) {
      return res.status(404).json({
        success: false,
        message: "Screen not found in this theatre",
      });
    }

    // Check for overlapping shows
    const conflictingShow = await Show.findOne({
      screen: screenId,
      status: "scheduled",
      isActive: true,
      startTime: { $lt: end },
      endTime: { $gt: start },
    });

    if (conflictingShow) {
      return res.status(409).json({
        success: false,
        message: "Another show is already scheduled during this time",
      });
    }

    // Create show
    const show = await Show.create({
      movie: movieId,
      theatre: theatreId,
      screen: screenId,
      showDate: start,
      startTime: start,
      endTime: end,
      language: language || "Hindi",
      format: format || "2D",
      seatPricing,
    });

    res.status(201).json({
      success: true,
      message: "Show scheduled successfully",
      show,
    });
  } catch (error) {
    next(error);
  }
};

// Get available shows for customers
exports.getAvailableShows = async (req, res, next) => {
  try {
    const { movieId, city, date } = req.query;

    const filter = {
      status: "scheduled",
      isActive: true,
      startTime: { $gt: new Date() },
    };

    if (movieId) {
      if (!require("mongoose").isValidObjectId(movieId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid movie ID",
        });
      }

      filter.movie = movieId;
    }

    if (date) {
      const selectedDate = new Date(`${date}T00:00:00+05:30`);

      if (Number.isNaN(selectedDate.getTime())) {
        return res.status(400).json({
          success: false,
          message: "Invalid date",
        });
      }

      const nextDate = new Date(selectedDate);
      nextDate.setDate(nextDate.getDate() + 1);

      filter.startTime = {
        $gte: selectedDate,
        $lt: nextDate,
        $gt: new Date(),
      };
    }

    const shows = await Show.find(filter)
      .populate("movie", "title poster durationMinutes certification")
      .populate("theatre", "name address")
      .populate("screen", "name screenType")
      .sort({ startTime: 1 });

    const filteredShows = city
      ? shows.filter(
          (show) =>
            show.theatre?.address?.city?.toLowerCase() ===
            city.trim().toLowerCase()
        )
      : shows;

    res.json({
      success: true,
      count: filteredShows.length,
      shows: filteredShows,
    });
  } catch (error) {
    next(error);
  }
};