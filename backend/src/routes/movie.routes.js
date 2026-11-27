const express = require("express");
const rateLimit = require("express-rate-limit");
const {
  getMovies,
  getMovieById,
  getTmdbMovieDetails,
  getTmdbMovieDiscovery,
} = require("../controllers/movie.controller");

const router = express.Router();
const tmdbDiscoveryLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many movie discovery requests. Please wait a moment and try again.",
  },
});
const tmdbDetailsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many movie detail requests. Please wait a moment and try again.",
  },
});

router.get("/discovery", tmdbDiscoveryLimiter, getTmdbMovieDiscovery);
router.get("/tmdb/:tmdbId", tmdbDetailsLimiter, getTmdbMovieDetails);
router.get("/", getMovies);
router.get("/:id", getMovieById);

module.exports = router;

