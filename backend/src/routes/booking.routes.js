const express = require("express");

const authMiddleware = require("../middlewares/auth.middleware");
const authorize = require("../middlewares/role.middleware");

const {
  getShowSeats,
  lockSeats,
} = require("../controllers/booking.controller");

const router = express.Router();

// View seat availability (public)
router.get("/shows/:showId/seats", getShowSeats);

// Lock selected seats (customer only)
router.post(
  "/shows/:showId/lock",
  authMiddleware,
  authorize("customer"),
  lockSeats
);

module.exports = router;