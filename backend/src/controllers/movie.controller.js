const mongoose = require("mongoose");
const Movie = require("../models/Movie");
const { getMovieDetails, getMovieDiscovery } = require("../services/tmdb.service");

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

exports.getMovies = async (req, res, next) => {
  try {
    const { search, genre } = req.query;

    if (
      (search !== undefined && typeof search !== "string") ||
      (genre !== undefined && typeof genre !== "string")
    ) {
      return res.status(400).json({
        success: false,
        message: "Search and genre must each be a single string",
      });
    }

    const normalizedSearch = search?.trim();
    const normalizedGenre = genre?.trim();

    if (normalizedSearch && normalizedSearch.length > 100) {
      return res.status(400).json({
        success: false,
        message: "Search must be 100 characters or fewer",
      });
    }

    if (normalizedGenre && normalizedGenre.length > 50) {
      return res.status(400).json({
        success: false,
        message: "Genre must be 50 characters or fewer",
      });
    }

    const filter = { isActive: true };

    if (normalizedSearch) {
      const searchPattern = new RegExp(escapeRegex(normalizedSearch), "i");
      filter.$or = [
        { title: searchPattern },
        { description: searchPattern },
      ];
    }

    if (normalizedGenre) {
      filter.genres = new RegExp(
        `^${escapeRegex(normalizedGenre)}$`,
        "i",
      );
    }

    const movies = await Movie.find(filter).sort({ title: 1, _id: 1 });

    return res.json({
      success: true,
      count: movies.length,
      movies,
    });
  } catch (error) {
    return next(error);
  }
};

exports.getMovieById = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid movie ID",
      });
    }

    const movie = await Movie.findOne({
      _id: id,
      isActive: true,
    });

    if (!movie) {
      return res.status(404).json({
        success: false,
        message: "Movie not found",
      });
    }

    return res.json({
      success: true,
      movie,
    });
  } catch (error) {
    return next(error);
  }
};

exports.getTmdbMovieDiscovery = async (_req, res) => {
  try {
    const catalogue = await getMovieDiscovery();
    return res.json({
      success: true,
      provider: "tmdb",
      ...catalogue,
    });
  } catch (error) {
    return res.status(error.statusCode || 502).json({
      success: false,
      code: error.code || "TMDB_UNAVAILABLE",
      message: error.message || "TMDB movie discovery is temporarily unavailable.",
    });
  }
};

exports.getTmdbMovieDetails = async (req, res) => {
  try {
    const movie = await getMovieDetails(req.params.tmdbId);
    return res.json({
      success: true,
      provider: "tmdb",
      movie,
    });
  } catch (error) {
    return res.status(error.statusCode || 502).json({
      success: false,
      code: error.code || "TMDB_UNAVAILABLE",
      message: error.message || "TMDB movie details are temporarily unavailable.",
    });
  }
};
