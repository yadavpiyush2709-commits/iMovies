
const express = require("express");

const authMiddleware = require("../middlewares/auth.middleware");
const authorize = require("../middlewares/role.middleware");

const {
  applyForTheatre,
  getMyTheatres,
  createScreen,
  getTheatreScreens,
  generateSeats,
  getScreenSeats,
  updateSeatCategory,
} = require("../controllers/theatre.controller");
const {
  createShow,
  getAvailableShows,
} = require("../controllers/show.controller");

const router = express.Router();

// Theatre owner access verification
router.get(
  "/access-check",
  authMiddleware,
  authorize("theatre_owner"),
  (req, res) => {
    res.json({
      success: true,
      message: "Theatre owner access verified",
      user: req.user,
    });
  }
);

// Submit theatre registration application
router.post(
  "/applications",
  authMiddleware,
  applyForTheatre
);

// Get all theatres belonging to logged-in owner
router.get(
  "/my-theatres",
  authMiddleware,
  authorize("theatre_owner"),
  getMyTheatres
);

// Create a screen inside an approved theatre
router.post(
  "/:theatreId/screens",
  authMiddleware,
  authorize("theatre_owner"),
  createScreen
);

// Get all screens of an owned theatre
router.get(
  "/:theatreId/screens",
  authMiddleware,
  authorize("theatre_owner"),
  getTheatreScreens
);

// Generate seats for a screen
router.post(
  "/:theatreId/screens/:screenId/generate-seats",
  authMiddleware,
  authorize("theatre_owner"),
  generateSeats
);

router.get(
  "/:theatreId/screens/:screenId/seats",
  authMiddleware,
  authorize("theatre_owner"),
  getScreenSeats
);

router.patch(
  "/:theatreId/screens/:screenId/seats/:seatId",
  authMiddleware,
  authorize("theatre_owner"),
  updateSeatCategory
);
// Schedule a new show
router.post(
  "/shows",
  authMiddleware,
  authorize("theatre_owner"),
  createShow
);
// Get available shows
router.get("/shows", getAvailableShows);

module.exports = router;
