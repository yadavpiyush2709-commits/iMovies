const STORAGE_KEYS = {
  movies: "imovies.movies.v1",
  bookings: "imovies.bookings.v1",
  profile: "imovies.profile.v1",
  theatres: "imovies.theatres.v1",
  shows: "imovies.shows.v1",
};

const initialMovies = [
  {
    id: "dune-part-two",
    title: "Dune: Part Two",
    genre: "Sci-Fi",
    rating: "8.9",
    duration: "2h 46m",
    language: "English",
    release: "Now Showing",
    label: "IMAX",
    year: "2024",
    synopsis: "Paul Atreides unites with Chani and the Fremen while seeking revenge against the conspirators who destroyed his family.",
    image: "https://images.unsplash.com/photo-1534796636912-3b95b3ab5986?auto=format&fit=crop&w=1200&q=88",
  },
  {
    id: "the-grand-escape",
    title: "The Grand Escape",
    genre: "Adventure",
    rating: "8.2",
    duration: "2h 08m",
    language: "English",
    release: "Now Showing",
    label: "NEW",
    year: "2025",
    synopsis: "A daring journey across wild country brings an unlikely crew together in a search for a place to call home.",
    image: "https://images.unsplash.com/photo-1478720568477-152d9b164e26?auto=format&fit=crop&w=1200&q=88",
  },
  {
    id: "midnight-in-paris",
    title: "Midnight in Paris",
    genre: "Drama",
    rating: "7.8",
    duration: "1h 54m",
    language: "English",
    release: "Now Showing",
    label: "",
    year: "2025",
    synopsis: "One unexpected night in the City of Light turns an ordinary trip into an unforgettable story.",
    image: "https://images.unsplash.com/photo-1499856871958-5b9627545d1a?auto=format&fit=crop&w=1200&q=88",
  },
  {
    id: "into-the-wild",
    title: "Into the Wild",
    genre: "Adventure",
    rating: "8.5",
    duration: "2h 12m",
    language: "English",
    release: "Now Showing",
    label: "4K",
    year: "2025",
    synopsis: "A solo trek into the mountains reveals the beauty and cost of leaving everything behind.",
    image: "https://images.unsplash.com/photo-1470252649378-9c29740c9fa8?auto=format&fit=crop&w=1200&q=88",
  },
  {
    id: "the-last-light",
    title: "The Last Light",
    genre: "Thriller",
    rating: "Coming Soon",
    duration: "2h 04m",
    language: "English",
    release: "Coming Soon",
    label: "DEC 12",
    year: "2025",
    synopsis: "When a remote town loses power, one radio host becomes the only voice left in the dark.",
    image: "https://images.unsplash.com/photo-1519608487953-e999c86e7455?auto=format&fit=crop&w=1200&q=88",
  },
  {
    id: "wild-horizons",
    title: "Wild Horizons",
    genre: "Adventure",
    rating: "Coming Soon",
    duration: "1h 58m",
    language: "English",
    release: "Coming Soon",
    label: "DEC 19",
    year: "2025",
    synopsis: "Two estranged siblings retrace their family's journey through the world's last wild places.",
    image: "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1200&q=88",
  },
];

const defaults = {
  [STORAGE_KEYS.movies]: initialMovies,
  [STORAGE_KEYS.bookings]: [],
  [STORAGE_KEYS.profile]: null,
  [STORAGE_KEYS.theatres]: [
    { id: "northstar", name: "Northstar Cinema", location: "Downtown", formats: "IMAX · Dolby Atmos" },
    { id: "grand-arc", name: "Grand Arc Theatre", location: "Midtown", formats: "Laser · Recliner" },
    { id: "violet-room", name: "Violet Room", location: "Westside", formats: "Dolby Cinema · 4K" },
  ],
  [STORAGE_KEYS.shows]: ["10:30 AM", "1:15 PM", "4:45 PM", "7:30 PM"],
};

function read(key) {
  try {
    const stored = localStorage.getItem(key);
    if (stored === null) {
      const initial = defaults[key];
      localStorage.setItem(key, JSON.stringify(initial));
      return initial;
    }

    return JSON.parse(stored);
  } catch (error) {
    console.error(`Unable to read ${key} from browser storage.`, error);
    throw new Error("Unable to load saved Tesseract Films data from this browser.");
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error(`Unable to save ${key} to browser storage.`, error);
    throw new Error("Your browser could not save this change. Check available storage and try again.");
  }
}

export function getMovies() {
  return read(STORAGE_KEYS.movies);
}

export function saveMovies(movies) {
  write(STORAGE_KEYS.movies, movies);
}

export function getBookings() {
  return read(STORAGE_KEYS.bookings);
}

export function saveBooking(booking) {
  const bookings = getBookings();
  write(STORAGE_KEYS.bookings, [booking, ...bookings]);
}

export function deleteBooking(id) {
  write(STORAGE_KEYS.bookings, getBookings().filter((booking) => booking.id !== id));
}

export function cancelBooking(id) {
  updateBookingStatus(id, "Cancelled");
}

export function updateBookingStatus(id, status) {
  write(
    STORAGE_KEYS.bookings,
    getBookings().map((booking) => booking.id === id ? { ...booking, status } : booking),
  );
}

export function getProfile() {
  return read(STORAGE_KEYS.profile);
}

export function saveProfile(profile) {
  write(STORAGE_KEYS.profile, profile);
}

export function getTheatres() {
  return read(STORAGE_KEYS.theatres);
}

export function saveTheatres(theatres) {
  write(STORAGE_KEYS.theatres, theatres);
}

export function getShowtimes() {
  return read(STORAGE_KEYS.shows);
}

export function saveShowtimes(showtimes) {
  write(STORAGE_KEYS.shows, showtimes);
}
