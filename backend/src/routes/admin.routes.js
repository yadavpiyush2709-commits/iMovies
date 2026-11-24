
const express = require("express");

const authMiddleware = require("../middlewares/auth.middleware");
const authorize = require("../middlewares/role.middleware");

const {
  getPendingTheatres,
  approveTheatre,
  rejectTheatre,
  createMovie,
} = require("../controllers/admin.controller");
const router = express.Router();

// Verify admin access
router.get(
  "/access-check",
  authMiddleware,
  authorize("admin"),
  (req, res) => {
    res.json({
      success: true,
      message: "Admin access verified",
      user: req.user,
    });
  }
);

// View pending theatre applications
router.get(
  "/theatres/pending",
  authMiddleware,
  authorize("admin"),
  getPendingTheatres
);

// Approve theatre application
router.patch(
  "/theatres/:id/approve",
  authMiddleware,
  authorize("admin"),
  approveTheatre
);

// Reject theatre application
router.patch(
  "/theatres/:id/reject",
  authMiddleware,
  authorize("admin"),
  rejectTheatre
);
// Create a new movie
router.post(
  "/movies",
  authMiddleware,
  authorize("admin"),
  createMovie
);
module.exports = router;
