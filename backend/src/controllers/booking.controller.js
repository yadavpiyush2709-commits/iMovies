const mongoose = require("mongoose");

const Booking = require("../models/Booking");
const Show = require("../models/Show");
const Seat = require("../models/Seat");
const ShowSeat = require("../models/ShowSeat");

// Get seat availability for a show
exports.getShowSeats = async (req, res, next) => {
  try {
    const { showId } = req.params;

    if (!mongoose.isValidObjectId(showId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid show ID",
      });
    }

    const show = await Show.findOne({
      _id: showId,
      status: "scheduled",
      isActive: true,
      startTime: { $gt: new Date() },
    });

    if (!show) {
      return res.status(404).json({
        success: false,
        message: "Show not found or no longer available",
      });
    }

    // Get all active physical seats for this screen
    const seats = await Seat.find({
      screen: show.screen,
      isActive: true,
    }).sort({ rowLabel: 1, seatNumber: 1 });

    if (seats.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No seats are configured for this screen",
      });
    }

    // Create missing show-seat records without resetting existing records
    await ShowSeat.bulkWrite(
      seats.map((seat) => ({
        updateOne: {
          filter: {
            show: show._id,
            seat: seat._id,
          },
          update: {
            $setOnInsert: {
              show: show._id,
              seat: seat._id,
              status: "available",
            },
          },
          upsert: true,
        },
      }))
    );

    // Release expired locks
    await ShowSeat.updateMany(
      {
        show: show._id,
        status: "locked",
        lockExpiresAt: { $lte: new Date() },
      },
      {
        $set: {
          status: "available",
          lockedBy: null,
          lockExpiresAt: null,
          booking: null,
        },
      }
    );

    const showSeats = await ShowSeat.find({
      show: show._id,
    })
      .populate("seat", "rowLabel seatNumber seatCode seatType")
      .sort({ "seat.rowLabel": 1, "seat.seatNumber": 1 });

    res.json({
      success: true,
      showId: show._id,
      totalSeats: showSeats.length,
      seats: showSeats,
    });
  } catch (error) {
    next(error);
  }
};
// Lock selected seats for a customer
exports.lockSeats = async (req, res, next) => {
  try {
    const { showId } = req.params;
    const { seatIds } = req.body;

    if (!mongoose.isValidObjectId(showId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid show ID",
      });
    }

    if (
      !Array.isArray(seatIds) ||
      seatIds.length === 0 ||
      seatIds.length > 10 ||
      new Set(seatIds).size !== seatIds.length ||
      !seatIds.every((id) => mongoose.isValidObjectId(id))
    ) {
      return res.status(400).json({
        success: false,
        message: "Select between 1 and 10 unique valid seats",
      });
    }

    const show = await Show.findOne({
      _id: showId,
      status: "scheduled",
      isActive: true,
      startTime: { $gt: new Date() },
    });

    if (!show) {
      return res.status(404).json({
        success: false,
        message: "Show not found or unavailable",
      });
    }

    const seats = await Seat.find({
      _id: { $in: seatIds },
      screen: show.screen,
      isActive: true,
    });

    if (seats.length !== seatIds.length) {
      return res.status(400).json({
        success: false,
        message: "One or more selected seats are invalid",
      });
    }

    let totalAmount = 0;

    for (const seat of seats) {
      const price = show.seatPricing[seat.seatType];

      if (typeof price !== "number" || !Number.isFinite(price)) {
        return res.status(400).json({
          success: false,
          message: `Pricing unavailable for ${seat.seatType} seats`,
        });
      }

      totalAmount += price;
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 5 * 60 * 1000);

    const booking = await Booking.create({
      bookingNumber: `IMV-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      customer: req.user.id,
      show: show._id,
      seats: seatIds,
      totalAmount,
      bookingStatus: "pending",
      paymentStatus: "pending",
      expiresAt,
    });

    const lockedSeats = [];

    try {
      for (const seatId of seatIds) {
        const lockedSeat = await ShowSeat.findOneAndUpdate(
          {
            show: show._id,
            seat: seatId,
            $or: [
              { status: "available" },
              {
                status: "locked",
                lockExpiresAt: { $lte: now },
              },
            ],
          },
          {
            $set: {
              status: "locked",
              lockedBy: req.user.id,
              lockExpiresAt: expiresAt,
              booking: booking._id,
            },
          },
          { new: true }
        );

        if (!lockedSeat) {
          throw new Error("One or more seats are no longer available");
        }

        lockedSeats.push(seatId);
      }
    } catch (error) {
      await ShowSeat.updateMany(
        {
          show: show._id,
          seat: { $in: lockedSeats },
          booking: booking._id,
        },
        {
          $set: {
            status: "available",
            lockedBy: null,
            lockExpiresAt: null,
            booking: null,
          },
        }
      );

      await Booking.deleteOne({ _id: booking._id });

      return res.status(409).json({
        success: false,
        message: error.message,
      });
    }

    res.status(201).json({
      success: true,
      message: "Seats locked successfully",
      booking: {
        id: booking._id,
        bookingNumber: booking.bookingNumber,
        totalAmount: booking.totalAmount,
        expiresAt: booking.expiresAt,
      },
    });
  } catch (error) {
    next(error);
  }
};