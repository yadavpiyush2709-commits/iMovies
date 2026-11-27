// Run from the backend folder with: node scripts/seedDemoMovies.js
const path = require("path");

require("dotenv").config({
  path: path.resolve(__dirname, "../.env"),
});

const mongoose = require("mongoose");
const connectDatabase = require("../src/config/database");
const Movie = require("../src/models/Movie");

const initialMovies = [
  {
    id: "dune-part-two",
    title: "Dune: Part Two",
    genre: "Sci-Fi",
    duration: "2h 46m",
    language: "English",
    release: "Now Showing",
    label: "IMAX",
    year: "2024",
    synopsis:
      "Paul Atreides unites with Chani and the Fremen while seeking revenge against the conspirators who destroyed his family.",
    image:
      "https://images.unsplash.com/photo-1534796636912-3b95b3ab5986?auto=format&fit=crop&w=1200&q=88",
  },
  {
    id: "the-grand-escape",
    title: "The Grand Escape",
    genre: "Adventure",
    duration: "2h 08m",
    language: "English",
    release: "Now Showing",
    label: "NEW",
    year: "2025",
    synopsis:
      "A daring journey across wild country brings an unlikely crew together in a search for a place to call home.",
    image:
      "https://images.unsplash.com/photo-1478720568477-152d9b164e26?auto=format&fit=crop&w=1200&q=88",
  },
  {
    id: "midnight-in-paris",
    title: "Midnight in Paris",
    genre: "Drama",
    duration: "1h 54m",
    language: "English",
    release: "Now Showing",
    label: "",
    year: "2025",
    synopsis:
      "One unexpected night in the City of Light turns an ordinary trip into an unforgettable story.",
    image:
      "https://images.unsplash.com/photo-1499856871958-5b9627545d1a?auto=format&fit=crop&w=1200&q=88",
  },
  {
    id: "into-the-wild",
    title: "Into the Wild",
    genre: "Adventure",
    duration: "2h 12m",
    language: "English",
    release: "Now Showing",
    label: "4K",
    year: "2025",
    synopsis:
      "A solo trek into the mountains reveals the beauty and cost of leaving everything behind.",
    image:
      "https://images.unsplash.com/photo-1470252649378-9c29740c9fa8?auto=format&fit=crop&w=1200&q=88",
  },
  {
    id: "the-last-light",
    title: "The Last Light",
    genre: "Thriller",
    duration: "2h 04m",
    language: "English",
    release: "Coming Soon",
    label: "DEC 12",
    year: "2025",
    synopsis:
      "When a remote town loses power, one radio host becomes the only voice left in the dark.",
    image:
      "https://images.unsplash.com/photo-1519608487953-e999c86e7455?auto=format&fit=crop&w=1200&q=88",
  },
  {
    id: "wild-horizons",
    title: "Wild Horizons",
    genre: "Adventure",
    duration: "1h 58m",
    language: "English",
    release: "Coming Soon",
    label: "DEC 19",
    year: "2025",
    synopsis:
      "Two estranged siblings retrace their family's journey through the world's last wild places.",
    image:
      "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1200&q=88",
  },
];

const allowedFormats = new Set(["2D", "3D", "IMAX", "4DX", "Other"]);
const releaseStatuses = {
  "Now Showing": "now_showing",
  "Coming Soon": "upcoming",
};

function normalizeTitle(title) {
  return title.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

function durationToMinutes(duration) {
  const match = duration.match(/^(\d+)h\s*(\d+)m$/);

  if (!match) {
    throw new Error(`Invalid duration for a demo movie`);
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (minutes > 59 || hours * 60 + minutes < 1) {
    throw new Error("Invalid duration for a demo movie");
  }

  return hours * 60 + minutes;
}

function toMovieDocument(source) {
  const year = Number(source.year);

  if (!Number.isInteger(year) || !/^\d{4}$/.test(source.year)) {
    throw new Error(`Invalid release year for ${source.title}`);
  }

  const status = releaseStatuses[source.release];

  if (!status) {
    throw new Error(`Unsupported release status for ${source.title}`);
  }

  const document = {
    title: source.title,
    description: source.synopsis,
    poster: source.image,
    backdrop: source.image,
    genres: [source.genre],
    durationMinutes: durationToMinutes(source.duration),
    // The source provides only a year; January 1 UTC is a year-only marker, not the actual release day.
    releaseDate: new Date(Date.UTC(year, 0, 1)),
    certification: null,
    languages: [source.language],
    status,
  };

  const format = source.label.trim();

  if (allowedFormats.has(format)) {
    document.formats = [format];
  }

  return document;
}

async function seedDemoMovies() {
  try {
    await connectDatabase();

    const existingMovies = await Movie.find({}, { title: 1 }).lean();
    const existingTitles = new Set(
      existingMovies
        .filter((movie) => typeof movie.title === "string")
        .map((movie) => normalizeTitle(movie.title)),
    );

    let inserted = 0;
    let skipped = 0;

    for (const source of initialMovies) {
      const normalizedTitle = normalizeTitle(source.title);

      if (existingTitles.has(normalizedTitle)) {
        skipped += 1;
        console.log(`Skipped existing movie: ${source.title}`);
        continue;
      }

      await Movie.create(toMovieDocument(source));
      existingTitles.add(normalizedTitle);
      inserted += 1;
      console.log(`Added movie: ${source.title}`);
    }

    console.log(`Movie seed complete. Added ${inserted}; skipped ${skipped}.`);
  } catch (error) {
    const errorName = error && error.name ? error.name : "Error";
    console.error(`Movie seed failed (${errorName}).`);
    process.exitCode = 1;
  } finally {
    try {
      await mongoose.disconnect();
    } catch (error) {
      const errorName = error && error.name ? error.name : "Error";
      console.error(`MongoDB disconnect failed (${errorName}).`);
      process.exitCode = 1;
    }
  }
}

seedDemoMovies();
