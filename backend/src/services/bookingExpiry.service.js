
const Booking = require("../models/Booking");
const ShowSeat = require("../models/ShowSeat");

let expiryTimer = null;
let isProcessing = false;

// Find expired pending bookings and release their seats
const processExpiredBookings = async () => {
  if (isProcessing) return;

  isProcessing = true;

  try {
    const now = new Date();

    const expiredBookings = await Booking.find({
      bookingStatus: "pending",
      paymentStatus: "pending",
      expiresAt: { $lte: now },
    }).select("_id");

    for (const booking of expiredBookings) {
      // Mark booking expired only if it is still pending
      const updatedBooking = await Booking.findOneAndUpdate(
        {
          _id: booking._id,
          bookingStatus: "pending",
          paymentStatus: "pending",
          expiresAt: { $lte: now },
        },
        {
          $set: {
            bookingStatus: "expired",
          },
        },
        { new: true }
      );

      if (!updatedBooking) continue;

      // Release seats belonging to this expired booking
      await ShowSeat.updateMany(
        {
          booking: updatedBooking._id,
          status: "locked",
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

      console.log(
        `Booking ${updatedBooking._id} expired. Seats released.`
      );
    }
  } catch (error) {
    console.error("Booking expiry service error:", error.message);
  } finally {
    isProcessing = false;
  }
};

// Start the expiry checker
const startBookingExpiryJob = () => {
  if (expiryTimer) return;

  console.log("Booking expiry service started.");

  // Process once immediately
  processExpiredBookings();

  // Check every 30 seconds
  expiryTimer = setInterval(processExpiredBookings, 30 * 1000);
};

module.exports = {
  startBookingExpiryJob,
  processExpiredBookings,
};
