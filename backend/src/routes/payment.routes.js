
const express = require("express");

const authMiddleware = require("../middlewares/auth.middleware");
const authorize = require("../middlewares/role.middleware");

const {
  createPaymentOrder,
} = require("../controllers/payment.controller");

const router = express.Router();

// Create Razorpay payment order (customer only)
router.post(
  "/create-order",
  authMiddleware,
  authorize("customer"),
  createPaymentOrder
);

module.exports = router;
