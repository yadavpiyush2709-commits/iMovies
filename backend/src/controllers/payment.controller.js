
const Razorpay = require("razorpay");
const mongoose = require("mongoose");

const Booking = require("../models/Booking");
const Payment = require("../models/Payment");
const ShowSeat = require("../models/ShowSeat");

const createPaymentOrder = async (req, res, next) => {
  try {
    const { bookingId } = req.body;

    if (!bookingId || !mongoose.isValidObjectId(bookingId)) {
      return res.status(400).json({
        success: false,
        message: "Valid booking ID is required",
      });
    }

    const booking = await Booking.findOne({
      _id: bookingId,
      customer: req.user.id,
      bookingStatus: "pending",
      paymentStatus: "pending",
      expiresAt: { $gt: new Date() },
    });

    if (!booking) {
      return res.status(400).json({
        success: false,
        message: "Booking is invalid or has expired",
      });
    }

    const lockedSeats = await ShowSeat.countDocuments({
      show: booking.show,
      seat: { $in: booking.seats },
      status: "locked",
      lockedBy: req.user.id,
      booking: booking._id,
      lockExpiresAt: { $gt: new Date() },
    });

    if (lockedSeats !== booking.seats.length) {
      return res.status(409).json({
        success: false,
        message: "Booking seats are no longer locked",
      });
    }

    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
      return res.status(503).json({
        success: false,
        message: "Payment gateway is not configured",
      });
    }

    const razorpay = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });

    const amount = Math.round(booking.totalAmount * 100);

    if (!Number.isSafeInteger(amount) || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid booking amount",
      });
    }

    const existingPayment = await Payment.findOne({
      booking: booking._id,
      status: "created",
    });

    if (existingPayment) {
      return res.json({
        success: true,
        message: "Payment order already exists",
        order: {
          id: existingPayment.razorpayOrderId,
          amount: existingPayment.amount,
          currency: existingPayment.currency,
          keyId,
        },
      });
    }

    const receipt = `IMV${Date.now()}`;

    const order = await razorpay.orders.create({
      amount,
      currency: "INR",
      receipt,
      notes: {
        bookingId: booking._id.toString(),
        bookingNumber: booking.bookingNumber,
      },
    });

    const payment = await Payment.create({
      booking: booking._id,
      customer: req.user.id,
      razorpayOrderId: order.id,
      amount: order.amount,
      currency: order.currency,
      status: "created",
      receipt,
    });

    res.status(201).json({
      success: true,
      message: "Payment order created successfully",
      order: {
        id: order.id,
        amount: order.amount,
        currency: order.currency,
        keyId,
      },
      paymentId: payment._id,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createPaymentOrder,
};
