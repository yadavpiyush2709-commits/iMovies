
const Theatre = require("../models/Theatre");
const Screen = require("../models/Screen");
const Seat = require("../models/Seat");

// Submit a theatre registration application
exports.applyForTheatre = async (req, res, next) => {
  try {
    const {
      name,
      description,
      address,
      contactPhone,
      contactEmail,
      facilities,
    } = req.body;

    if (
      !name ||
      !address?.street ||
      !address?.city ||
      !address?.state ||
      !address?.postalCode ||
      !contactPhone
    ) {
      return res.status(400).json({
        success: false,
        message: "Please provide all required theatre details",
      });
    }

    const theatre = await Theatre.create({
      name,
      owner: req.user.id,
      description,
      address,
      contactPhone,
      contactEmail,
      facilities,
      approvalStatus: "pending",
    });

    res.status(201).json({
      success: true,
      message: "Theatre application submitted for admin approval",
      theatre,
    });
  } catch (error) {
    next(error);
  }
};


// Get all theatres belonging to the logged-in theatre owner
exports.getMyTheatres = async (req, res, next) => {
  try {
    const theatres = await Theatre.find({
      owner: req.user.id,
    }).sort({ createdAt: -1 });

    res.json({
      success: true,
      count: theatres.length,
      theatres,
    });
  } catch (error) {
    next(error);
  }
};


const validScreenTypes = [
  "standard",
  "imax",
  "4dx",
  "dolby_cinema",
  "other",
];

// Create a new screen inside an approved theatre
exports.createScreen = async (req, res, next) => {
  try {
    const { name, screenType, totalRows, seatsPerRow } = req.body;

    if (
      typeof name !== "string" ||
      !name.trim() ||
      !Number.isInteger(totalRows) ||
      !Number.isInteger(seatsPerRow) ||
      totalRows < 1 ||
      totalRows > 100 ||
      seatsPerRow < 1 ||
      seatsPerRow > 100
    ) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid screen name, row count and seats per row",
      });
    }

    if (screenType && !validScreenTypes.includes(screenType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid screen type",
      });
    }

    const theatre = await Theatre.findOne({
      _id: req.params.theatreId,
      owner: req.user.id,
      approvalStatus: "approved",
      isActive: true,
    });

    if (!theatre) {
      return res.status(404).json({
        success: false,
        message: "Approved theatre not found or access denied",
      });
    }

    const screen = await Screen.create({
      theatre: theatre._id,
      name: name.trim(),
      screenType: screenType || "standard",
      totalRows,
      seatsPerRow,
    });

    res.status(201).json({
      success: true,
      message: "Screen created successfully",
      screen,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "A screen with this name already exists in this theatre",
      });
    }

    next(error);
  }
};

// Get screens belonging to a specific approved theatre
exports.getTheatreScreens = async (req, res, next) => {
  try {
    const theatre = await Theatre.findOne({
      _id: req.params.theatreId,
      owner: req.user.id,
      approvalStatus: "approved",
      isActive: true,
    });

    if (!theatre) {
      return res.status(404).json({
        success: false,
        message: "Approved theatre not found or access denied",
      });
    }

    const screens = await Screen.find({
      theatre: theatre._id,
      isActive: true,
    }).sort({ createdAt: -1 });

    res.json({
      success: true,
      count: screens.length,
      screens,
    });
  } catch (error) {
    next(error);
  }
};


// Generate all seats for an existing screen
exports.generateSeats = async (req, res, next) => {
  try {
    const { theatreId, screenId } = req.params;

    const theatre = await Theatre.findOne({
      _id: theatreId,
      owner: req.user.id,
      approvalStatus: "approved",
      isActive: true,
    });

    if (!theatre) {
      return res.status(404).json({
        success: false,
        message: "Approved theatre not found or access denied",
      });
    }

    const screen = await Screen.findOne({
      _id: screenId,
      theatre: theatre._id,
      isActive: true,
    });

    if (!screen) {
      return res.status(404).json({
        success: false,
        message: "Screen not found",
      });
    }

    const existingSeats = await Seat.countDocuments({
      screen: screen._id,
    });

    if (existingSeats > 0) {
      return res.status(409).json({
        success: false,
        message: "Seats have already been generated for this screen",
      });
    }

    const seats = [];

    for (let row = 0; row < screen.totalRows; row++) {
      const rowLabel = String.fromCharCode(65 + row);

      for (let number = 1; number <= screen.seatsPerRow; number++) {
        const seatCode = `${rowLabel}${number}`;

        seats.push({
          screen: screen._id,
          rowLabel,
          seatNumber: number,
          seatCode,
          seatType: "regular",
        });
      }
    }

    await Seat.insertMany(seats);

    res.status(201).json({
      success: true,
      message: "Seats generated successfully",
      totalSeats: seats.length,
    });
  } catch (error) {
    next(error);
  }
};


exports.getScreenSeats = async (req, res, next) => {
  try {
    const theatre = await Theatre.findOne({
      _id: req.params.theatreId,
      owner: req.user.id,
      approvalStatus: "approved",
      isActive: true,
    });

    if (!theatre) {
      return res.status(404).json({
        success: false,
        message: "Theatre not found or access denied",
      });
    }

    const screen = await Screen.findOne({
      _id: req.params.screenId,
      theatre: theatre._id,
      isActive: true,
    });

    if (!screen) {
      return res.status(404).json({
        success: false,
        message: "Screen not found",
      });
    }

    const seats = await Seat.find({
      screen: screen._id,
      isActive: true,
    }).sort({ rowLabel: 1, seatNumber: 1 });

    res.json({
      success: true,
      totalSeats: seats.length,
      seats,
    });
  } catch (error) {
    next(error);
  }
};


exports.updateSeatCategory = async (req, res, next) => {
  try {
    const { theatreId, screenId, seatId } = req.params;
    const { seatType } = req.body;

    const validSeatTypes = ["regular", "premium", "recliner"];

    if (!validSeatTypes.includes(seatType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid seat category",
      });
    }

    const theatre = await Theatre.findOne({
      _id: theatreId,
      owner: req.user.id,
      approvalStatus: "approved",
      isActive: true,
    });

    if (!theatre) {
      return res.status(404).json({
        success: false,
        message: "Theatre not found or access denied",
      });
    }

    const screen = await Screen.findOne({
      _id: screenId,
      theatre: theatre._id,
      isActive: true,
    });

    if (!screen) {
      return res.status(404).json({
        success: false,
        message: "Screen not found",
      });
    }

    const seat = await Seat.findOneAndUpdate(
      {
        _id: seatId,
        screen: screen._id,
        isActive: true,
      },
      {
        $set: { seatType },
      },
      {
        new: true,
        runValidators: true,
      }
    );

    if (!seat) {
      return res.status(404).json({
        success: false,
        message: "Seat not found",
      });
    }

    res.json({
      success: true,
      message: "Seat category updated successfully",
      seat,
    });
  } catch (error) {
    next(error);
  }
};
