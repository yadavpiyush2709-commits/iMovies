import React, { useEffect, useMemo, useState } from "react";
import {
  BrowserRouter,
  Link,
  Navigate,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import {
  cancelBooking,
  deleteBooking,
  getBookings,
  getShowtimes,
  getTheatres,
  saveMovies,
  saveShowtimes,
  saveTheatres,
  updateBookingStatus as setStoredBookingStatus,
} from "./services/demoStore";
import {
  fetchMovieDiscovery,
  fetchMovies,
  fetchTmdbMovieDetails,
} from "./services/movieApi";
import { fetchAvailableShows } from "./services/showApi";
import { BookingApiError, fetchShowSeats, lockShowSeats } from "./services/bookingApi";
import {
  AuthApiError,
  clearAuthSession,
  loginUser,
  registerUser,
  requestMobileVerification,
  requestPasswordReset,
  resendMobileVerification,
  resendRegistrationOtp,
  resetPassword,
  restoreAuthSession,
  saveAuthSession,
  verifyMobileNumber,
  verifyRegistrationOtp,
} from "./services/authApi";

const genres = ["All genres", "Action", "Adventure", "Drama", "Sci-Fi", "Thriller"];
const PENDING_REGISTRATION_SESSION_KEY = "tesseract.films.pending-registration.v1";
const releaseLabels = {
  now_showing: "Now Showing",
  upcoming: "Coming Soon",
  ended: "Ended",
};
const discoveryCategories = [
  { key: "trending", title: "Trending Movies" },
  { key: "popular", title: "Popular Movies" },
  { key: "topRated", title: "Top Rated Movies" },
  { key: "nowPlaying", title: "TMDB Now Playing" },
  { key: "upcoming", title: "TMDB Upcoming" },
  { key: "bollywood", title: "Bollywood Movies" },
  { key: "hollywood", title: "Hollywood Movies" },
  { key: "indianCinema", title: "Indian Cinema" },
  { key: "recentlyReleased", title: "Recently Released" },
];
const EMPTY_MOVIE_IDS = new Set();

function mapBackendMovie(movie) {
  const durationMinutes = Number(movie.durationMinutes);
  const hours = Math.floor(durationMinutes / 60);
  const minutes = durationMinutes % 60;
  const releaseDate = new Date(movie.releaseDate);

  return {
    id: String(movie._id),
    title: movie.title,
    image: getSafeExternalUrl(movie.poster),
    backdrop: getSafeExternalUrl(movie.backdrop),
    trailerUrl: getSafeExternalUrl(movie.trailerUrl, true),
    genre: Array.isArray(movie.genres) && movie.genres[0] ? movie.genres[0] : "Other",
    genres: Array.isArray(movie.genres) ? movie.genres : [],
    duration: `${hours}h ${String(minutes).padStart(2, "0")}m`,
    language: Array.isArray(movie.languages) && movie.languages[0] ? movie.languages[0] : "Not specified",
    synopsis: movie.description,
    release: releaseLabels[movie.status],
    certification: movie.certification || "",
    releaseDate: Number.isNaN(releaseDate.getTime()) ? "" : releaseDate.toISOString(),
    year: Number.isNaN(releaseDate.getTime()) ? "" : String(releaseDate.getUTCFullYear()),
    formats: Array.isArray(movie.formats) ? movie.formats : [],
    label: Array.isArray(movie.formats) ? movie.formats.join(" · ") : "",
    cast: Array.isArray(movie.cast) ? movie.cast : [],
    director: typeof movie.director === "string" ? movie.director : "",
  };
}

function mapTmdbMovie(movie) {
  const releaseDate = new Date(`${movie.releaseDate}T00:00:00Z`);
  const validReleaseDate = movie.releaseDate && !Number.isNaN(releaseDate.getTime())
    ? releaseDate.toISOString()
    : "";
  return {
    id: `tmdb-${movie.tmdbId}`,
    tmdbId: String(movie.tmdbId),
    isTmdb: true,
    title: movie.title,
    image: getSafeExternalUrl(movie.poster),
    backdrop: getSafeExternalUrl(movie.backdrop),
    trailerUrl: "",
    genre: movie.genres?.[0] || "Other",
    genres: Array.isArray(movie.genres) ? movie.genres : [],
    duration: "",
    language: movie.language || movie.originalLanguage || "",
    synopsis: movie.overview || "",
    release: "TMDB Catalogue",
    certification: "",
    releaseDate: validReleaseDate,
    year: validReleaseDate ? String(releaseDate.getUTCFullYear()) : "",
    formats: [],
    label: "",
    cast: [],
    director: "",
    tmdbRating: typeof movie.rating === "number" ? movie.rating : null,
    tmdbVoteCount: Number.isSafeInteger(movie.voteCount) ? movie.voteCount : 0,
  };
}

function getMovieMatchKey(movie) {
  const title = movie.title?.trim().toLocaleLowerCase("en");
  if (!title || !movie.year) return "";
  return `${title}|${movie.year}`;
}

function getMovieTitleKey(movie) {
  return movie.title?.trim().toLocaleLowerCase("en") || "";
}

function mergeMovieCatalogues(localMovies, discovery) {
  if (!discovery?.movies || !discovery?.categories) {
    return { movies: localMovies, categories: {} };
  }

  const tmdbMovies = discovery.movies.map(mapTmdbMovie);
  const tmdbByMatchKey = new Map();
  const tmdbByTitle = new Map();
  const localTitleCounts = new Map();
  for (const movie of tmdbMovies) {
    const key = getMovieMatchKey(movie);
    if (key) {
      const matches = tmdbByMatchKey.get(key) || [];
      matches.push(movie);
      tmdbByMatchKey.set(key, matches);
    }
    const title = getMovieTitleKey(movie);
    if (title) {
      const matches = tmdbByTitle.get(title) || [];
      matches.push(movie);
      tmdbByTitle.set(title, matches);
    }
  }
  localMovies.forEach((movie) => {
    const title = getMovieTitleKey(movie);
    if (title) localTitleCounts.set(title, (localTitleCounts.get(title) || 0) + 1);
  });

  const matchedTmdbIds = new Set();
  const tmdbIdToMovieId = new Map();
  const mergedLocalMovies = localMovies.map((localMovie) => {
    const key = getMovieMatchKey(localMovie);
    const title = getMovieTitleKey(localMovie);
    const exactYearMatch = key && (tmdbByMatchKey.get(key) || [])
      .find((candidate) => !matchedTmdbIds.has(candidate.tmdbId));
    const uniqueTitleMatches = tmdbByTitle.get(title) || [];
    const match = exactYearMatch || (
      localTitleCounts.get(title) === 1 &&
      uniqueTitleMatches.filter((candidate) => !matchedTmdbIds.has(candidate.tmdbId)).length === 1
        ? uniqueTitleMatches.find((candidate) => !matchedTmdbIds.has(candidate.tmdbId))
        : null
    );
    if (!match) return localMovie;

    matchedTmdbIds.add(match.tmdbId);
    tmdbIdToMovieId.set(match.tmdbId, localMovie.id);
    return {
      ...localMovie,
      image: match.image || localMovie.image,
      backdrop: match.backdrop || localMovie.backdrop,
      genres: localMovie.genres.length ? localMovie.genres : match.genres,
      genre: localMovie.genre || match.genre,
      language: localMovie.language === "Not specified" ? match.language : localMovie.language,
      synopsis: localMovie.synopsis || match.synopsis,
      year: localMovie.year || match.year,
      releaseDate: localMovie.releaseDate || match.releaseDate,
      tmdbId: match.tmdbId,
      tmdbRating: match.tmdbRating,
      tmdbVoteCount: match.tmdbVoteCount,
    };
  });

  const movies = [
    ...mergedLocalMovies,
    ...tmdbMovies.filter((movie) => !matchedTmdbIds.has(movie.tmdbId)),
  ];
  const categories = Object.fromEntries(
    Object.entries(discovery.categories).map(([name, ids]) => [
      name,
      ids.map((tmdbId) =>
        tmdbIdToMovieId.get(String(tmdbId)) || `tmdb-${tmdbId}`),
    ]),
  );
  return { movies, categories };
}

function formatVoteCount(value) {
  return new Intl.NumberFormat("en").format(value);
}

function getSafeExternalUrl(value, httpsOnly = false) {
  if (typeof value !== "string" || !value.trim()) return "";

  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && (httpsOnly || url.protocol !== "http:")) return "";
    if (url.hostname === "example.com" || url.hostname.endsWith(".example.com")) return "";
    return url.href;
  } catch {
    return "";
  }
}

function getTodayInCinemaTimezone() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function formatCinemaDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(date);
}

function formatCinemaTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Time unavailable";
  return new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  }).format(date);
}

function formatShowPriceRange(seatPricing) {
  const prices = ["regular", "premium", "recliner"]
    .map((seatType) => seatPricing?.[seatType])
    .filter((price) => typeof price === "number" && Number.isFinite(price) && price >= 0);

  if (!prices.length) return "";

  const formatPrice = (price) => new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 2,
  }).format(price);
  const lowest = Math.min(...prices);
  const highest = Math.max(...prices);

  return lowest === highest
    ? `₹${formatPrice(lowest)}`
    : `₹${formatPrice(lowest)}–₹${formatPrice(highest)}`;
}

function formatSeatPrice(price) {
  return `₹${new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 2,
  }).format(price)}`;
}

function formatSeatHoldExpiry(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "soon";
  return `${new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  }).format(date)} IST`;
}

function getSafeReturnTo(value) {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//")
    ? value
    : "/";
}

function getAuthPath(path, returnTo) {
  const query = new URLSearchParams({
    returnTo: getSafeReturnTo(returnTo),
  });
  return `${path}?${query.toString()}`;
}

function Icon({ name, size = 18 }) {
  const paths = {
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    pin: <><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
    ticket: <><path d="M2 9a3 3 0 0 0 0 6v3h20v-3a3 3 0 0 1 0-6V6H2v3Z" /><path d="M13 6v2m0 4v2m0 4v1" /></>,
    arrow: <><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></>,
    close: <><path d="m18 6-12 12M6 6l12 12" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    play: <path d="m9 6 10 6-10 6V6Z" />,
    menu: <><path d="M4 6h16M4 12h16M4 18h16" /></>,
    chevron: <path d="m7 10 5 5 5-5" />,
    star: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z" />,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 11h18" /></>,
    film: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M7 3v18M17 3v18M3 8h4m-4 8h4m10-8h4m-4 8h4" /></>,
    logout: <><path d="M10 17l5-5-5-5" /><path d="M15 12H3" /><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    trash: <><path d="M3 6h18m-2 0-.9 14H5.9L5 6m4 0V4h6v2m-5 4v6m4-6v6" /></>,
    alert: <><circle cx="12" cy="12" r="9" /><path d="M12 8v5m0 3h.01" /></>,
    eye: <><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" /><circle cx="12" cy="12" r="3" /></>,
    eyeOff: <><path d="m3 3 18 18M10.6 6.2A10.7 10.7 0 0 1 12 6c6.5 0 10 6 10 6a17 17 0 0 1-3.1 3.8M6.2 6.2C3.5 8 2 12 2 12s3.5 6 10 6c1 0 1.9-.2 2.7-.4" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></>,
  };

  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  );
}

function Header({ profile, onSignOut, isGuest = false, returnTo = "/" }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  function signOut() {
    onSignOut();
    setMenuOpen(false);
    setProfileMenuOpen(false);
  }

  return (
    <header className={`site-header ${isGuest ? "guest-site-header" : ""}`}>
      <Link className="brand" to="/" aria-label="Tesseract Films home">
        <span className="brand-mark"><Icon name="film" size={15} /></span>
        <span>Tesseract Films<span className="brand-period">.</span></span>
      </Link>
      <button className="mobile-menu-button" type="button" aria-label="Toggle navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>
        <Icon name="menu" />
      </button>
      <nav className={`main-nav ${menuOpen ? "is-open" : ""}`} aria-label="Main navigation">
        <NavLink to="/" end onClick={() => setMenuOpen(false)}>Home</NavLink>
        <Link to="/movies" onClick={() => setMenuOpen(false)}>Movies</Link>
        <Link to="/#theatres" onClick={() => setMenuOpen(false)}>Theatres</Link>
        {!isGuest && <NavLink to="/my-bookings" onClick={() => setMenuOpen(false)}>My Bookings</NavLink>}
        {!isGuest && profile?.role === "admin" && <NavLink className="admin-nav-link" to="/admin" onClick={() => setMenuOpen(false)}>Manage</NavLink>}
      </nav>
      <div className="header-utility">
        <Link className="header-search-link" to="/movies" aria-label="Search movies" onClick={() => setMenuOpen(false)}>
          <Icon name="search" size={17} /><span>Search</span>
        </Link>
        <Link className="header-location-link" to="/#theatres" aria-label="Find showtimes by city" onClick={() => setMenuOpen(false)}>
          <Icon name="pin" size={16} /><span>Set city</span>
        </Link>
      </div>
      <div className="header-account">
        {isGuest ? (
          <div className="guest-header-actions">
            <Link className="guest-header-login" to={getAuthPath("/sign-in", returnTo)}>Log in</Link>
            <Link className="button button-primary guest-header-signup" to={getAuthPath("/register", returnTo)}>Create account</Link>
          </div>
        ) : (
          <div className="profile-menu">
            <button
              className="profile-menu-trigger"
              type="button"
              aria-haspopup="menu"
              aria-expanded={profileMenuOpen}
              onClick={() => setProfileMenuOpen((open) => !open)}
            >
              <span className="profile-avatar" aria-hidden="true">{(profile.name || profile.email || "T").trim().charAt(0).toUpperCase()}</span>
              <span className="profile-trigger-name">{profile.name || profile.email}</span>
              <Icon name="chevron" size={14} />
            </button>
            {profileMenuOpen && (
              <div className="profile-menu-popover" role="menu">
                <Link role="menuitem" to="/profile" onClick={() => setProfileMenuOpen(false)}>Account profile</Link>
                <Link role="menuitem" to="/my-bookings" onClick={() => setProfileMenuOpen(false)}>My bookings</Link>
                <button role="menuitem" type="button" onClick={signOut}>Sign out</button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}

function LandingPage({ sessionError, onRetrySession, onContinueAsGuest }) {
  return (
    <main className="landing-page">
      <div className="landing-artwork">
        <img
          src="/tesseract-hero.png"
          alt="Tesseract Films cinematic artwork"
        />
      </div>
      <div className="landing-actions" aria-label="Account access">
        <Link className="button button-ghost" to="/sign-in">Log in</Link>
        <Link className="button button-primary" to="/register">Create account</Link>
        <button className="button button-subtle" type="button" onClick={onContinueAsGuest}>Continue as Guest</button>
      </div>
      {sessionError && (
        <div className="landing-session-error" role="alert">
          <p>{sessionError}</p>
          <button className="text-button" type="button" onClick={onRetrySession}>
            Retry session check
          </button>
        </div>
      )}
    </main>
  );
}

function LoginPromptPage({ returnTo }) {
  const destination = getSafeReturnTo(returnTo);

  return (
    <main className="auth-page auth-page-single login-required-page">
      <section className="auth-card auth-card-recovery">
        <span className="section-kicker">YOUR TESSERACT FILMS ACCOUNT</span>
        <h2>Sign in to continue</h2>
        <p>Browsing is open to everyone. Sign in or create an account to hold seats and manage bookings.</p>
        <div className="login-required-actions">
          <Link className="button button-primary" to={getAuthPath("/sign-in", destination)}>Log in</Link>
          <Link className="button button-ghost" to={getAuthPath("/register", destination)}>Create account</Link>
        </div>
        <Link className="auth-return-link" to="/">Continue browsing movies</Link>
      </section>
    </main>
  );
}

function Footer() {
  return (
    <footer className="site-footer">
      <Link className="brand footer-brand" to="/"><span className="brand-mark"><Icon name="play" size={13} /></span><span>Tesseract Films<span className="brand-period">.</span></span></Link>
      <span className="footer-copy">The best stories deserve the biggest screen. © {new Date().getFullYear()} Tesseract Films</span>
      <div className="footer-links"><Link to="/movies">Movies</Link><Link to="/my-bookings">My bookings</Link><Link to="/admin">Manage</Link></div>
    </footer>
  );
}

function MovieCard({ movie, hasShows = false }) {
  const [failedPoster, setFailedPoster] = useState("");

  return (
    <article className="movie-card">
      <Link className="poster-link" to={`/movies/${movie.id}`} aria-label={`View ${movie.title} details`}>
        <div className="movie-poster">
          {movie.image && failedPoster !== movie.image
            ? <img className="movie-poster-image" src={movie.image} alt={`${movie.title} poster`} loading="lazy" decoding="async" onError={() => setFailedPoster(movie.image)} />
            : <div className="poster-unavailable"><Icon name="film" size={22} /><span>Poster artwork unavailable</span></div>}
          <span className={`poster-status ${movie.release === "Coming Soon" ? "is-upcoming" : ""}`}>{movie.release}</span>
          {movie.certification && <span className="poster-certification">{movie.certification}</span>}
        </div>
      </Link>
      <div className="movie-card-copy">
        <h3>{movie.title}</h3>
        <p>{[movie.year, movie.genres.join(" · ") || movie.genre, movie.duration].filter(Boolean).join(" · ")}</p>
        <div className="movie-card-meta">
          <span>{movie.language}{movie.label ? ` · ${movie.label}` : ""}</span>
          {movie.tmdbRating !== null && movie.tmdbRating !== undefined && (
            <span className="tmdb-rating">TMDB {movie.tmdbRating.toFixed(1)}/10 · {formatVoteCount(movie.tmdbVoteCount)} votes</span>
          )}
        </div>
      </div>
      <div className="movie-card-actions">
        <Link className="movie-details-action" to={`/movies/${movie.id}`}>Details</Link>
        {!movie.isTmdb && hasShows && (
          <Link className="card-cta has-live-show" to={`/book/${movie.id}`}>
            Book tickets <Icon name="arrow" size={14} />
          </Link>
        )}
        {!movie.isTmdb && !hasShows && movie.release === "Now Showing" && (
          <Link className="card-cta" to={`/book/${movie.id}`}>
            Find showtimes <Icon name="arrow" size={14} />
          </Link>
        )}
      </div>
    </article>
  );
}

function MovieRail({ title, movies, bookableMovieIds, id, category }) {
  return (
    <section className="movie-rail" id={id}>
      <div className="rail-heading">
        <div><span className="section-kicker">TESSERACT FILMS · CINEMA</span><h2>{title}</h2></div>
        <Link className="rail-action" to={category ? `/movies?category=${encodeURIComponent(category)}` : "/movies"}>
          View all <Icon name="arrow" size={14} />
        </Link>
      </div>
      {movies.length
        ? <div className="movie-row">{movies.map((movie) => <MovieCard key={movie.id} movie={movie} hasShows={bookableMovieIds?.has(movie.id) || false} />)}</div>
        : <div className="empty-panel movie-catalogue-empty"><h3>No movies listed here right now</h3><p>Check back later for updates to the cinema catalogue.</p></div>}
    </section>
  );
}

function ShowtimeDiscovery({ movies, initialMovieId = "", sectionId = "available-shows", onShowsChange }) {
  const today = getTodayInCinemaTimezone();
  const [movieId, setMovieId] = useState(initialMovieId);
  const [city, setCity] = useState("");
  const [date, setDate] = useState(today);
  const [appliedFilters, setAppliedFilters] = useState({
    movieId: initialMovieId,
    city: "",
    date: today,
  });
  const [shows, setShows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [requestAttempt, setRequestAttempt] = useState(0);

  useEffect(() => {
    setMovieId(initialMovieId);
    setAppliedFilters((current) => ({ ...current, movieId: initialMovieId }));
  }, [initialMovieId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");

    fetchAvailableShows(appliedFilters)
      .then((availableShows) => {
        if (active) setShows(availableShows);
      })
      .catch((requestError) => {
        if (active) {
          setShows([]);
          setError(requestError instanceof Error ? requestError.message : "Unable to load showtimes.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [appliedFilters, requestAttempt]);

  useEffect(() => {
    if (onShowsChange) onShowsChange(shows);
  }, [shows, onShowsChange]);

  function applyFilters(event) {
    event.preventDefault();
    setAppliedFilters({ movieId, city: city.trim(), date });
  }

  return (
    <section className="showtime-discovery" id={sectionId}>
      <div className="showtime-discovery-heading">
        <div>
          <span className="section-kicker">REAL-TIME CINEMA LISTINGS</span>
          <h2>Find a <em>showtime.</em></h2>
          <p>Explore scheduled screenings from participating theatres.</p>
        </div>
      </div>
      <form className="showtime-discovery-filters" onSubmit={applyFilters}>
        {!initialMovieId && (
          <label>
            <span>Movie</span>
            <select value={movieId} onChange={(event) => setMovieId(event.target.value)}>
              <option value="">All movies</option>
              {movies.map((movie) => <option value={movie.id} key={movie.id}>{movie.title}</option>)}
            </select>
          </label>
        )}
        <label>
          <span>City</span>
          <input value={city} onChange={(event) => setCity(event.target.value)} placeholder="Enter a city" autoComplete="address-level2" />
        </label>
        <label>
          <span>Date</span>
          <input type="date" min={today} value={date} onChange={(event) => setDate(event.target.value)} />
        </label>
        <button className="button button-primary" type="submit">Find showtimes <Icon name="arrow" size={15} /></button>
      </form>
      {loading ? (
        <div className="showtime-discovery-state" role="status">Loading available showtimes…</div>
      ) : error ? (
        <div className="showtime-discovery-error" role="alert">
          <p>{error}</p>
          <button className="text-button" type="button" onClick={() => setRequestAttempt((attempt) => attempt + 1)}>Try again</button>
        </div>
      ) : shows.length === 0 ? (
        <div className="showtime-discovery-state" role="status">
          <Icon name="calendar" size={19} />
          <strong>No showtimes available for this selection yet.</strong>
          <span>Try another movie, city, or date.</span>
        </div>
      ) : (
        <div className="showtime-discovery-list">
          {shows.map((show) => {
            const linkedMovieId = String(show.movie?._id || show.movie || "");
            const movieTitle = show.movie?.title || movies.find((movie) => movie.id === linkedMovieId)?.title || "Movie";
            const cityName = show.theatre?.address?.city;
            const location = [cityName, show.theatre?.address?.state].filter(Boolean).join(", ");
            const priceRange = formatShowPriceRange(show.seatPricing);
            const params = new URLSearchParams();
            if (cityName) params.set("city", cityName);
            if (appliedFilters.date) params.set("date", appliedFilters.date);
            params.set("showId", String(show._id));

            return (
              <article className="showtime-discovery-card" key={show._id}>
                <div className="showtime-discovery-movie">
                  <span>{movieTitle}</span>
                  <strong>{show.theatre?.name || "Theatre name unavailable"}</strong>
                  {location && <small>{location}</small>}
                </div>
                <div className="showtime-discovery-detail">
                  <span>Screen</span>
                  <strong>{show.screen?.name || "Not specified"}</strong>
                </div>
                <div className="showtime-discovery-detail">
                  <span>Showtime</span>
                  <strong>{formatCinemaDate(show.startTime)} · {formatCinemaTime(show.startTime)}</strong>
                </div>
                {priceRange && <div className="showtime-discovery-detail"><span>Tickets from</span><strong>{priceRange}</strong></div>}
                {linkedMovieId && (
                  <Link className="button button-ghost" to={`/book/${encodeURIComponent(linkedMovieId)}?${params.toString()}`}>
                    View seats <Icon name="arrow" size={14} />
                  </Link>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function getCategoryMovies(movies, categories, category) {
  const movieById = new Map(movies.map((movie) => [movie.id, movie]));
  return (categories[category] || [])
    .map((id) => movieById.get(id))
    .filter(Boolean);
}

function FeaturedCarousel({ slides, bookableMovieIds }) {
  const [activeId, setActiveId] = useState(slides[0]?.id || "");
  const [failedBackdropId, setFailedBackdropId] = useState("");
  const [paused, setPaused] = useState(false);
  const [pageVisible, setPageVisible] = useState(!document.hidden);
  const [reducedMotion, setReducedMotion] = useState(() =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const activeIndex = Math.max(0, slides.findIndex((movie) => movie.id === activeId));
  const movie = slides[activeIndex];

  useEffect(() => {
    if (slides.length && !slides.some((slide) => slide.id === activeId)) {
      setActiveId(slides[0].id);
    }
  }, [slides, activeId]);

  useEffect(() => {
    const handleVisibilityChange = () => setPageVisible(!document.hidden);
    const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handleMotionChange = (event) => setReducedMotion(event.matches);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    motionPreference.addEventListener("change", handleMotionChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      motionPreference.removeEventListener("change", handleMotionChange);
    };
  }, []);

  useEffect(() => {
    if (slides.length < 2 || paused || !pageVisible || reducedMotion) return undefined;
    const timer = window.setInterval(() => {
      setActiveId((currentId) => {
        const index = slides.findIndex((slide) => slide.id === currentId);
        return slides[(index + 1 + slides.length) % slides.length].id;
      });
    }, 6000);
    return () => window.clearInterval(timer);
  }, [slides, paused, pageVisible, reducedMotion]);

  function moveSlide(direction) {
    const nextIndex = (activeIndex + direction + slides.length) % slides.length;
    setActiveId(slides[nextIndex].id);
  }

  function handleKeyDown(event) {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      moveSlide(-1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      moveSlide(1);
    }
  }

  if (!movie) return null;
  const hasShows = bookableMovieIds.has(movie.id);
  const releaseDateLabel = movie.releaseDate
    ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(movie.releaseDate))
    : "";

  return (
    <section
      className="hero hero-carousel"
      aria-label="Featured movies"
      aria-roledescription="carousel"
      tabIndex={0}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false);
      }}
      onKeyDown={handleKeyDown}
    >
      <div className="hero-art" aria-hidden="true">
        {movie.backdrop && failedBackdropId !== movie.id
          ? <img className="hero-backdrop-image" key={movie.id} src={movie.backdrop} alt="" onError={() => setFailedBackdropId(movie.id)} />
          : <div className="hero-art-fallback"><Icon name="film" size={42} /><span>Movie artwork unavailable</span></div>}
        <div className="hero-image-overlay" />
      </div>
      <div className="hero-content" key={movie.id}>
        <div className="eyebrow"><span /> TESSERACT FILMS · FEATURED FILM</div>
        <div className="hero-feature-label">
          <span>{movie.isTmdb ? "DISCOVER ON TMDB" : movie.release.toUpperCase()}</span>
          {movie.formats.length > 0 && <><span className="hero-divider" /><span>{movie.formats.join(" · ")}</span></>}
        </div>
        <h1>{movie.title}</h1>
        <p>{movie.synopsis || "Discover this film and check whether local cinema screenings are available."}</p>
        {movie.tmdbRating !== null && movie.tmdbRating !== undefined && (
          <div className="hero-rating">TMDB <strong>{movie.tmdbRating.toFixed(1)}/10</strong><span>· {formatVoteCount(movie.tmdbVoteCount)} votes</span></div>
        )}
        <div className="hero-actions">
          {hasShows && (
            <Link className="button button-primary" to={`/book/${movie.id}`}>
              <Icon name="ticket" size={17} /> Book tickets
            </Link>
          )}
          {!hasShows && !movie.isTmdb && movie.release === "Now Showing" && (
            <Link className="button button-primary" to={`/book/${movie.id}`}>
              <Icon name="ticket" size={17} /> Find showtimes
            </Link>
          )}
          {movie.trailerUrl && <a className="button button-outline" href={movie.trailerUrl} target="_blank" rel="noopener noreferrer"><Icon name="play" size={16} /> Watch trailer</a>}
          <Link className="button button-ghost" to={`/movies/${movie.id}`}>View details <Icon name="arrow" size={16} /></Link>
        </div>
        <div className="hero-metadata">
          {[movie.year, movie.genres.join(", "), movie.language, movie.duration, releaseDateLabel].filter(Boolean).map((value) => <span key={value}>{value}</span>)}
        </div>
      </div>
      {slides.length > 1 && (
        <div className="hero-carousel-controls">
          <div className="hero-carousel-arrows">
            <button type="button" aria-label="Previous featured movie" onClick={() => moveSlide(-1)}>‹</button>
            <button type="button" aria-label="Next featured movie" onClick={() => moveSlide(1)}>›</button>
          </div>
          <div className="hero-carousel-dots" role="group" aria-label="Choose a featured movie">
            {slides.map((slide, index) => (
              <button
                type="button"
                key={slide.id}
                aria-label={`Show slide ${index + 1}: ${slide.title}`}
                aria-current={slide.id === movie.id ? "true" : undefined}
                className={slide.id === movie.id ? "active" : ""}
                onClick={() => setActiveId(slide.id)}
              />
            ))}
          </div>
          <span className="hero-carousel-count">{String(activeIndex + 1).padStart(2, "0")} <i>/</i> {String(slides.length).padStart(2, "0")}</span>
        </div>
      )}
    </section>
  );
}

function HomePage({
  movies,
  localMovies,
  categories,
  discoveryLoading,
  discoveryError,
  discoveryWarnings = [],
  bookableMovieIds,
  showAvailabilityError,
}) {
  const [search, setSearch] = useState("");
  const [genre, setGenre] = useState("All genres");
  const featuredSlides = useMemo(() => {
    const candidateIds = [
      ...(categories.trending || []),
      ...(categories.popular || []),
      ...(categories.topRated || []),
      ...localMovies.map((movie) => movie.id),
    ];
    const seen = new Set();
    const slides = candidateIds
      .map((id) => movies.find((movie) => movie.id === id))
      .filter((movie) => {
        if (!movie || seen.has(movie.id)) return false;
        seen.add(movie.id);
        return Boolean(movie.backdrop);
      })
      .slice(0, 8);
    if (slides.length) return slides;
    return [localMovies.find((movie) => movie.release === "Now Showing") || movies[0]].filter(Boolean);
  }, [movies, localMovies, categories]);
  const nowShowing = localMovies.filter((movie) => movie.release === "Now Showing");
  const comingSoon = localMovies.filter((movie) => movie.release === "Coming Soon");
  const availableGenres = [...new Set(movies.flatMap((movie) => movie.genres))].sort((left, right) => left.localeCompare(right));
  const filtered = useMemo(() => movies.filter((movie) => {
    const matchesText = `${movie.title} ${movie.genres.join(" ")} ${movie.language}`.toLowerCase().includes(search.trim().toLowerCase());
    const matchesGenre = genre === "All genres" || movie.genres.includes(genre);
    return matchesText && matchesGenre;
  }), [movies, search, genre]);

  return (
    <>
      <FeaturedCarousel slides={featuredSlides} bookableMovieIds={bookableMovieIds} />
      <main className="page-content cinema-home">
        <div className="discovery-toolbar" id="catalogue">
          <div><span className="section-kicker">THE CINEMA LINEUP</span><h2>Find your next <em>favorite.</em></h2><p>{movies.length} distinct movie records · local showtimes are listed separately.</p></div>
          <div className="filter-controls">
            <label className="search-field"><Icon name="search" size={17} /><input type="search" aria-label="Search movies" placeholder="Search movies..." value={search} onChange={(event) => setSearch(event.target.value)} /></label>
            <label className="genre-select-label"><span className="sr-only">Filter by genre</span><select value={genre} onChange={(event) => setGenre(event.target.value)}><option>All genres</option>{availableGenres.map((item) => <option key={item}>{item}</option>)}</select><Icon name="chevron" size={14} /></label>
            <Link className="button button-subtle catalogue-view-all" to="/movies">View all movies <Icon name="arrow" size={14} /></Link>
          </div>
        </div>

        {search || genre !== "All genres" ? (
          <section className="movie-rail filtered-rail">
            <div className="rail-heading"><div><span className="section-kicker">CATALOGUE SEARCH</span><h2>{filtered.length} {filtered.length === 1 ? "result" : "results"}</h2></div></div>
            {filtered.length
              ? <div className="movie-row">{filtered.map((movie) => <MovieCard key={movie.id} movie={movie} hasShows={bookableMovieIds.has(movie.id)} />)}</div>
              : <div className="empty-panel"><Icon name="search" size={24} /><h3>No matching movies</h3><p>Try a different title or genre.</p><button className="button button-subtle" type="button" onClick={() => { setSearch(""); setGenre("All genres"); }}>Clear filters</button></div>}
          </section>
        ) : (
          <>
            <MovieRail title="Now Showing" movies={nowShowing} bookableMovieIds={bookableMovieIds} id="now-showing" />
            <MovieRail title="Coming Soon" movies={comingSoon} bookableMovieIds={bookableMovieIds} id="coming-soon" />
            {discoveryCategories.map(({ key, title }) => {
              const categoryMovies = getCategoryMovies(movies, categories, key);
              return categoryMovies.length > 0 && (
                <MovieRail
                  key={key}
                  title={title}
                  movies={categoryMovies}
                  bookableMovieIds={bookableMovieIds}
                  category={key}
                />
              );
            })}
            {discoveryLoading && <CatalogueLoadingState />}
            {discoveryError && <div className="catalogue-notice" role="status">{discoveryError}</div>}
            {discoveryWarnings.length > 0 && <div className="catalogue-notice" role="status">{discoveryWarnings.join(" ")}</div>}
          </>
        )}

        {showAvailabilityError && (
          <div className="catalogue-notice" role="status">
            Local show availability could not be verified. Ticket actions remain unavailable until the theatre service responds.
          </div>
        )}
        <ShowtimeDiscovery movies={localMovies} sectionId="theatres" />
        <TmdbAttribution />
      </main>
    </>
  );
}

function CatalogueLoadingState() {
  return (
    <section className="catalogue-loading" aria-label="Loading TMDB movie collections" aria-busy="true">
      <span className="section-kicker">LOADING MOVIE DISCOVERY</span>
      <div className="catalogue-skeleton-row">{Array.from({ length: 6 }, (_, index) => <div className="catalogue-skeleton" key={index} />)}</div>
    </section>
  );
}

function MovieCataloguePage({
  movies,
  categories,
  discoveryLoading,
  discoveryError,
  discoveryWarnings = [],
  bookableMovieIds,
}) {
  const location = useLocation();
  const initialCategory = new URLSearchParams(location.search).get("category") || "all";
  const [activeCategory, setActiveCategory] = useState(initialCategory);
  const [search, setSearch] = useState("");
  const [genre, setGenre] = useState("All genres");
  const [language, setLanguage] = useState("All languages");
  const [sort, setSort] = useState("popular");
  const [visibleCount, setVisibleCount] = useState(24);
  const genres = [...new Set(movies.flatMap((movie) => movie.genres))].sort((left, right) => left.localeCompare(right));
  const languages = [...new Set(movies.map((movie) => movie.language).filter(Boolean))].sort((left, right) => left.localeCompare(right));
  const activeCategoryTitle = discoveryCategories.find((category) => category.key === activeCategory)?.title || "All Movies";
  const categoryMovies = activeCategory === "all" ? movies : getCategoryMovies(movies, categories, activeCategory);
  const filteredMovies = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("en");
    const filtered = categoryMovies.filter((movie) => {
      const matchesSearch = !query || `${movie.title} ${movie.genres.join(" ")} ${movie.language}`.toLocaleLowerCase("en").includes(query);
      const matchesGenre = genre === "All genres" || movie.genres.includes(genre);
      const matchesLanguage = language === "All languages" || movie.language === language;
      return matchesSearch && matchesGenre && matchesLanguage;
    });

    return filtered.sort((left, right) => {
      if (sort === "rating") return (right.tmdbRating || 0) - (left.tmdbRating || 0);
      if (sort === "release") return (right.releaseDate || "").localeCompare(left.releaseDate || "");
      if (sort === "title") return left.title.localeCompare(right.title);
      return 0;
    });
  }, [categoryMovies, search, genre, language, sort]);

  useEffect(() => {
    setActiveCategory(new URLSearchParams(location.search).get("category") || "all");
  }, [location.search]);

  useEffect(() => {
    setVisibleCount(24);
  }, [activeCategory, search, genre, language, sort]);

  return (
    <main className="page-content catalogue-page">
      <header className="catalogue-page-heading">
        <span className="section-kicker">MOVIE DISCOVERY</span>
        <h1>{activeCategoryTitle}</h1>
        <p>Explore real movie records. A catalogue listing does not indicate local showtime availability.</p>
      </header>
      <div className="catalogue-category-tabs" aria-label="Movie categories">
        <button type="button" className={activeCategory === "all" ? "active" : ""} onClick={() => setActiveCategory("all")}>All movies</button>
        {discoveryCategories.filter((item) => categories[item.key]?.length).map((item) => (
          <button type="button" key={item.key} className={activeCategory === item.key ? "active" : ""} onClick={() => setActiveCategory(item.key)}>{item.title}</button>
        ))}
      </div>
      <div className="catalogue-filters">
        <label className="search-field"><Icon name="search" size={17} /><input type="search" aria-label="Search all movies" placeholder="Search titles, genres, languages..." value={search} onChange={(event) => setSearch(event.target.value)} /></label>
        <label><span>Genre</span><select value={genre} onChange={(event) => setGenre(event.target.value)}><option>All genres</option>{genres.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label><span>Language</span><select value={language} onChange={(event) => setLanguage(event.target.value)}><option>All languages</option>{languages.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label><span>Sort by</span><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="popular">Catalogue order</option><option value="rating">TMDB rating</option><option value="release">Release date</option><option value="title">Title</option></select></label>
      </div>
      {discoveryLoading && <CatalogueLoadingState />}
      {discoveryError && <div className="catalogue-notice" role="status">{discoveryError}</div>}
      {discoveryWarnings.length > 0 && <div className="catalogue-notice" role="status">{discoveryWarnings.join(" ")}</div>}
      <div className="catalogue-results-count">{filteredMovies.length} movies <span>· Showing {Math.min(visibleCount, filteredMovies.length)}</span></div>
      {filteredMovies.length ? (
        <div className="movie-grid catalogue-movie-grid">
          {filteredMovies.slice(0, visibleCount).map((movie) => (
            <MovieCard key={movie.id} movie={movie} hasShows={bookableMovieIds.has(movie.id)} />
          ))}
        </div>
      ) : (
        <div className="empty-panel"><Icon name="film" size={24} /><h2>No movies match these filters</h2><p>Change your search or filters to see more results.</p></div>
      )}
      {visibleCount < filteredMovies.length && (
        <button className="button button-subtle catalogue-load-more" type="button" onClick={() => setVisibleCount((count) => count + 24)}>
          Load more movies <span>{Math.min(24, filteredMovies.length - visibleCount)} more</span>
        </button>
      )}
      <TmdbAttribution />
    </main>
  );
}

function TmdbAttribution() {
  const [logoUnavailable, setLogoUnavailable] = useState(false);
  return (
    <aside className="tmdb-attribution" aria-label="TMDB attribution">
      <a href="https://www.themoviedb.org/" target="_blank" rel="noopener noreferrer" aria-label="The Movie Database">
        {!logoUnavailable && <img src="https://www.themoviedb.org/assets/2/v4/logos/stacked-blue.svg" alt="The Movie Database" onError={() => setLogoUnavailable(true)} />}
        {logoUnavailable && <strong>TMDB</strong>}
      </a>
      <p>This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
    </aside>
  );
}

function MovieDetailsPage({
  movies,
  localMovies = movies,
  bookableMovieIds = EMPTY_MOVIE_IDS,
  showAvailabilityError = "",
}) {
  const { movieId } = useParams();
  const movie = movies.find((item) => item.id === movieId);
  const tmdbId = movie?.tmdbId;
  const [detailRequest, setDetailRequest] = useState({ tmdbId: "", loading: false, error: "", movie: null });
  const [failedPoster, setFailedPoster] = useState("");

  useEffect(() => {
    if (!tmdbId) {
      setDetailRequest({ tmdbId: "", loading: false, error: "", movie: null });
      return undefined;
    }

    let active = true;
    setDetailRequest({ tmdbId, loading: true, error: "", movie: null });
    fetchTmdbMovieDetails(tmdbId)
      .then((details) => {
        if (active) setDetailRequest({ tmdbId, loading: false, error: "", movie: details });
      })
      .catch((error) => {
        if (active) {
          setDetailRequest({
            tmdbId,
            loading: false,
            error: error instanceof Error ? error.message : "Unable to load additional movie details.",
            movie: null,
          });
        }
      });

    return () => {
      active = false;
    };
  }, [tmdbId]);

  const tmdbDetails = detailRequest.tmdbId === tmdbId ? detailRequest.movie : null;
  useEffect(() => {
    setFailedPoster("");
  }, [movieId, tmdbDetails?.poster]);
  if (!movie) return <NotFound />;
  const detailMovie = tmdbDetails
    ? {
      ...movie,
      image: tmdbDetails.poster || movie.image,
      backdrop: tmdbDetails.backdrop || movie.backdrop,
      synopsis: tmdbDetails.overview || movie.synopsis,
      genres: tmdbDetails.genres.length ? tmdbDetails.genres : movie.genres,
      language: tmdbDetails.language || movie.language,
      releaseDate: tmdbDetails.releaseDate || movie.releaseDate,
      year: tmdbDetails.releaseDate ? tmdbDetails.releaseDate.slice(0, 4) : movie.year,
      duration: tmdbDetails.runtimeMinutes
        ? `${Math.floor(tmdbDetails.runtimeMinutes / 60)}h ${String(tmdbDetails.runtimeMinutes % 60).padStart(2, "0")}m`
        : movie.duration,
      cast: tmdbDetails.cast,
      director: tmdbDetails.director,
      tmdbRating: tmdbDetails.rating,
      tmdbVoteCount: tmdbDetails.voteCount,
    }
    : movie;
  const trailerUrl = getSafeExternalUrl(tmdbDetails?.trailers?.[0]?.url || detailMovie.trailerUrl, true);
  const backdrop = detailMovie.backdrop;
  const hasShows = bookableMovieIds.has(movie.id);
  return (
    <main className="details-page">
      <div className="details-backdrop" style={{ backgroundImage: `linear-gradient(90deg, #08090d 0%, #08090de0 48%, #08090d66 100%)${backdrop ? `, url("${backdrop}")` : ""}` }} />
      <div className="details-content">
        <Link className="back-link" to="/movies"><span>←</span> All movies</Link>
        <div className="detail-layout">
          <div className="detail-poster">
            {detailMovie.image && failedPoster !== detailMovie.image
              ? <img src={detailMovie.image} alt={`${detailMovie.title} poster`} onError={() => setFailedPoster(detailMovie.image)} />
              : <div className="poster-unavailable"><Icon name="film" size={28} /><strong>{detailMovie.title}</strong><span>Poster artwork unavailable</span></div>}
          </div>
          <div className="detail-copy">
            <div className="eyebrow"><span /> {detailMovie.release.toUpperCase()}{detailMovie.year ? ` · ${detailMovie.year}` : ""}</div>
            <h1>{detailMovie.title}</h1>
            {detailMovie.tmdbRating !== null && detailMovie.tmdbRating !== undefined && (
              <div className="detail-rating"><strong>TMDB {detailMovie.tmdbRating.toFixed(1)}/10</strong><span>{formatVoteCount(detailMovie.tmdbVoteCount)} votes</span></div>
            )}
            <div className="detail-pills">
              {detailMovie.genres.map((item) => <span key={item}>{item}</span>)}
              {detailMovie.duration && <span>{detailMovie.duration}</span>}
              {detailMovie.language && <span>{detailMovie.language}</span>}
              {detailMovie.formats.map((item) => <span key={item}>{item}</span>)}
              {detailMovie.certification && <span>{detailMovie.certification}</span>}
              {detailMovie.releaseDate && <span>Released {new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(detailMovie.releaseDate))}</span>}
            </div>
            {detailMovie.director && <p className="detail-credits"><strong>Director</strong> {detailMovie.director}</p>}
            {detailMovie.cast.length > 0 && <p className="detail-credits"><strong>Cast</strong> {detailMovie.cast.map((person) => person.name).filter(Boolean).join(", ")}</p>}
            {detailRequest.loading && <p className="detail-loading" role="status">Loading cast, runtime, and trailer information…</p>}
            {detailRequest.error && <p className="detail-loading" role="status">Additional TMDB details are unavailable right now: {detailRequest.error}</p>}
            <p className="detail-synopsis">{detailMovie.synopsis || "Movie information has not been provided yet."}</p>
            <div className="detail-actions">
              {hasShows && <Link className="button button-primary" to={`/book/${movie.id}`}>Book tickets <Icon name="arrow" size={16} /></Link>}
              {!movie.isTmdb && !hasShows && movie.release === "Now Showing" && <Link className="button button-ghost" to={`/book/${movie.id}`}>Check showtimes <Icon name="arrow" size={16} /></Link>}
              {trailerUrl && <a className="button button-ghost" href={trailerUrl} target="_blank" rel="noopener noreferrer"><Icon name="play" size={16} /> Watch trailer</a>}
            </div>
          </div>
        </div>
        {movie.isTmdb ? (
          <section className="showtime-discovery" id="movie-showtimes">
            <div className="showtime-discovery-heading">
              <span className="section-kicker">LOCAL CINEMA AVAILABILITY</span>
              <h2>Find a <em>showtime.</em></h2>
            </div>
            <div className="showtime-discovery-state" role="status">
              <strong>No local showtimes are listed for this movie yet.</strong>
              <span>TMDB discovery information does not create theatre or show records.</span>
            </div>
          </section>
        ) : (
          <ShowtimeDiscovery movies={localMovies} initialMovieId={movie.id} sectionId="movie-showtimes" />
        )}
        {showAvailabilityError && !movie.isTmdb && <div className="catalogue-notice" role="status">{showAvailabilityError}</div>}
        <TmdbAttribution />
      </div>
    </main>
  );
}

function BookingPage({
  movies,
  catalogueMovies = movies,
  profile,
  token,
  isGuest = false,
  onRequireLogin,
  bookableMovieIds = EMPTY_MOVIE_IDS,
  showAvailabilityError = "",
}) {
  const { movieId } = useParams();
  const location = useLocation();
  const initialParams = new URLSearchParams(location.search);
  const movie = movies.find((item) => item.id === movieId);
  const [cityInput, setCityInput] = useState(() => initialParams.get("city") || "");
  const [dateInput, setDateInput] = useState(() => initialParams.get("date") || getTodayInCinemaTimezone());
  const [appliedCity, setAppliedCity] = useState(() => initialParams.get("city") || "");
  const [appliedDate, setAppliedDate] = useState(() => initialParams.get("date") || getTodayInCinemaTimezone());
  const [shows, setShows] = useState([]);
  const [showsLoading, setShowsLoading] = useState(false);
  const [showsError, setShowsError] = useState("");
  const [showLoadAttempt, setShowLoadAttempt] = useState(0);
  const [selectedShowId, setSelectedShowId] = useState(() => initialParams.get("showId") || "");
  const [showSeats, setShowSeats] = useState([]);
  const [seatsLoading, setSeatsLoading] = useState(false);
  const [seatsError, setSeatsError] = useState("");
  const [seatLoadAttempt, setSeatLoadAttempt] = useState(0);
  const [selectedSeatIds, setSelectedSeatIds] = useState([]);
  const [lockLoading, setLockLoading] = useState(false);
  const [seatLock, setSeatLock] = useState(null);
  const [lockError, setLockError] = useState("");
  const [lockNotice, setLockNotice] = useState("");
  const selectedShow = shows.find((show) => String(show._id) === selectedShowId);

  useEffect(() => {
    if (!movie || movie.release === "Coming Soon") {
      setShows([]);
      setShowsLoading(false);
      setShowsError("");
      return undefined;
    }

    let active = true;
    setShowsLoading(true);
    setShowsError("");

    fetchAvailableShows({
      movieId,
      city: appliedCity,
      date: appliedDate,
    })
      .then((availableShows) => {
        if (active) {
          setShows(availableShows);
          setSelectedShowId((current) =>
            availableShows.some((show) => String(show._id) === current)
              ? current
              : "",
          );
        }
      })
      .catch((requestError) => {
        if (active) {
          setShows([]);
          setSelectedShowId("");
          setShowsError(
            requestError instanceof Error
              ? requestError.message
              : "Unable to load showtimes.",
          );
        }
      })
      .finally(() => {
        if (active) setShowsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [movie, movieId, appliedCity, appliedDate, showLoadAttempt]);

  useEffect(() => {
    if (!selectedShow) {
      setShowSeats([]);
      setSeatsLoading(false);
      setSeatsError("");
      return undefined;
    }

    let active = true;
    setSeatsLoading(true);
    setSeatsError("");

    fetchShowSeats(selectedShow._id)
      .then((availableSeats) => {
        if (!active) return;
        setShowSeats(availableSeats);

        const availableIds = new Set(
          availableSeats
            .filter((showSeat) => showSeat.status === "available")
            .map((showSeat) => String(showSeat.seat._id)),
        );
        const heldIds = new Set(
          seatLock && Date.parse(seatLock.expiresAt) > Date.now()
            ? seatLock.seatIds
            : [],
        );
        setSelectedSeatIds((current) =>
          current.filter((id) => availableIds.has(id) || heldIds.has(id)),
        );
      })
      .catch((requestError) => {
        if (active) {
          setShowSeats([]);
          setSelectedSeatIds([]);
          setSeatsError(
            requestError instanceof Error
              ? requestError.message
              : "Unable to load seats for this show.",
          );
        }
      })
      .finally(() => {
        if (active) setSeatsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedShow, seatLoadAttempt, seatLock]);

  useEffect(() => {
    if (!seatLock) return undefined;

    const expiresAt = Date.parse(seatLock.expiresAt);
    if (!Number.isFinite(expiresAt)) return undefined;

    const timeout = setTimeout(() => {
      setSeatLock(null);
      setSelectedSeatIds([]);
      setLockNotice("Your temporary seat hold expired. Seat availability has been refreshed.");
      setSeatLoadAttempt((attempt) => attempt + 1);
    }, Math.max(0, expiresAt - Date.now()) + 250);

    return () => clearTimeout(timeout);
  }, [seatLock]);

  const selectedTheatre = selectedShow?.theatre
    ? {
      name: selectedShow.theatre.name,
      location: [
        selectedShow.theatre.address?.city,
        selectedShow.theatre.address?.state,
      ].filter(Boolean).join(", "),
    }
    : null;
  const showtime = selectedShow ? formatCinemaTime(selectedShow.startTime) : "";
  const showDate = selectedShow
    ? formatCinemaDate(selectedShow.startTime)
    : formatCinemaDate(`${appliedDate}T00:00:00+05:30`);
  const seatRows = useMemo(() => {
    const rows = new Map();

    showSeats.forEach((showSeat) => {
      const { rowLabel } = showSeat.seat;
      if (!rows.has(rowLabel)) rows.set(rowLabel, []);
      rows.get(rowLabel).push(showSeat);
    });

    return Array.from(rows, ([label, seats]) => ({
      label,
      seats: seats.sort((left, right) =>
        left.seat.seatNumber - right.seat.seatNumber,
      ),
    }));
  }, [showSeats]);
  const seatsById = useMemo(
    () => new Map(showSeats.map((showSeat) => [String(showSeat.seat._id), showSeat])),
    [showSeats],
  );
  const selectedSeatData = selectedSeatIds
    .map((id) => seatsById.get(id))
    .filter(Boolean);
  const selectedSeatTotal = selectedSeatData.reduce((total, showSeat) => {
    const price = selectedShow?.seatPricing?.[showSeat.seat.seatType];
    return typeof price === "number" && Number.isFinite(price)
      ? total + price
      : total;
  }, 0);
  const hasValidSeatSelection = selectedSeatIds.length > 0 &&
    selectedSeatIds.length <= 10 &&
    selectedSeatData.length === selectedSeatIds.length &&
    selectedSeatData.every((showSeat) => {
      const price = selectedShow?.seatPricing?.[showSeat.seat.seatType];
      return showSeat.status === "available" &&
        typeof price === "number" &&
        Number.isFinite(price) &&
        price >= 0;
    });
  const activeSeatLock = seatLock &&
    Date.parse(seatLock.expiresAt) > Date.now()
    ? seatLock
    : null;
  const displayedTotal = activeSeatLock
    ? activeSeatLock.totalAmount
    : selectedSeatTotal;
  const seatCounts = showSeats.reduce((counts, showSeat) => {
    counts[showSeat.status] = (counts[showSeat.status] || 0) + 1;
    return counts;
  }, {});

  if (!movie) return <NotFound />;
  if (movie.release === "Coming Soon") {
    return (
      <MovieDetailsPage
        movies={catalogueMovies}
        localMovies={movies}
        bookableMovieIds={bookableMovieIds}
        showAvailabilityError={showAvailabilityError}
      />
    );
  }

  function applyShowFilters() {
    if (activeSeatLock) return;
    setAppliedCity(cityInput.trim());
    setAppliedDate(dateInput);
    setSelectedShowId("");
  }

  function handleSeatLockAction() {
    if (!isGuest) {
      lockSelectedSeats();
      return;
    }

    const params = new URLSearchParams();
    if (appliedCity) params.set("city", appliedCity);
    if (appliedDate) params.set("date", appliedDate);
    if (selectedShowId) params.set("showId", selectedShowId);
    const query = params.toString();
    onRequireLogin(`${location.pathname}${query ? `?${query}` : ""}`);
  }

  async function lockSelectedSeats() {
    if (lockLoading) return;
    setLockError("");
    setLockNotice("");

    if (!token) {
      setLockError("Your sign-in session is unavailable. Please sign in again.");
      return;
    }

    if (!selectedShow || !hasValidSeatSelection || activeSeatLock) {
      setLockError("Select available seats with valid pricing before placing a hold.");
      return;
    }

    setLockLoading(true);
    try {
      const result = await lockShowSeats(
        selectedShow._id,
        [...selectedSeatIds],
        token,
      );
      setSeatLock({
        seatIds: [...selectedSeatIds],
        totalAmount: result.totalAmount,
        expiresAt: result.expiresAt,
      });
    } catch (requestError) {
      setSelectedSeatIds([]);

      if (requestError instanceof BookingApiError && requestError.status === 409) {
        setLockError(
          "One or more selected seats are now booked or held by another customer. Availability is being refreshed; please choose again.",
        );
      } else if (requestError instanceof BookingApiError && requestError.status === 401) {
        setLockError("Your sign-in session expired. Please sign in again before holding seats.");
      } else {
        setLockError(
          requestError instanceof Error
            ? requestError.message
            : "Unable to confirm the seat hold. Refresh availability before trying again.",
        );
      }

      setSeatLoadAttempt((attempt) => attempt + 1);
    } finally {
      setLockLoading(false);
    }
  }

  function chooseShow(showId) {
    if (activeSeatLock) return;
    setSelectedShowId(showId);
    setSelectedSeatIds([]);
    setSeatLock(null);
    setLockError("");
    setLockNotice("");
  }

  function toggleSeat(seatId) {
    if (activeSeatLock) return;
    setLockError("");
    setLockNotice("");

    if (selectedSeatIds.includes(seatId)) {
      setSelectedSeatIds((current) => current.filter((id) => id !== seatId));
      return;
    }

    if (selectedSeatIds.length >= 10) {
      setLockError("You can hold a maximum of 10 seats at a time.");
      return;
    }

    setSelectedSeatIds((current) =>
      current.includes(seatId) ? current : [...current, seatId],
    );
  }

  return (
    <main className="booking-page">
      <div className="page-eyebrow"><span className="section-kicker">YOUR EVENING STARTS HERE</span><h1>Make it a <em>movie night.</em></h1><p>Choose your cinema, find your seats, and we’ll save the story.</p></div>
      <div className="booking-layout">
        <div className="booking-main">
          <section className="booking-step">
            <StepHeading number="01" title="Find a show" helper="Choose a city and date to see live cinema availability." />
            <div className="show-filter-controls">
              <label>
                City
                <input
                  type="text"
                  value={cityInput}
                  disabled={Boolean(activeSeatLock)}
                  onChange={(event) => setCityInput(event.target.value)}
                  placeholder="Enter a city"
                  autoComplete="address-level2"
                />
              </label>
              <label>
                Date
                <input
                  type="date"
                  value={dateInput}
                  disabled={Boolean(activeSeatLock)}
                  onChange={(event) => setDateInput(event.target.value)}
                />
              </label>
              <button className="button button-subtle" type="button" onClick={applyShowFilters} disabled={showsLoading || Boolean(activeSeatLock)}>
                {showsLoading ? "Searching..." : "Find shows"}
              </button>
            </div>
            {showsLoading ? (
              <div className="empty-inline" role="status">Loading available shows...</div>
            ) : showsError ? (
              <div className="show-discovery-error" role="alert">
                <p>{showsError}</p>
                <button className="text-button" type="button" onClick={() => setShowLoadAttempt((attempt) => attempt + 1)}>
                  Try again
                </button>
              </div>
            ) : shows.length ? (
              <div className="available-show-list">
                {shows.map((show) => {
                  const theatre = show.theatre || {};
                  const address = theatre.address || {};
                  const screen = show.screen || {};
                  const showId = String(show._id);
                  const priceRange = formatShowPriceRange(show.seatPricing);

                  return (
                    <button
                      className={`available-show-option ${selectedShowId === showId ? "selected" : ""}`}
                      type="button"
                      key={showId}
                      aria-pressed={selectedShowId === showId}
                      disabled={Boolean(activeSeatLock)}
                      onClick={() => chooseShow(showId)}
                    >
                      <span className="available-show-theatre">
                        <strong>{theatre.name || "Theatre name unavailable"}</strong>
                        <small>{[address.city, address.state].filter(Boolean).join(", ") || "Location unavailable"}</small>
                      </span>
                      <span className="available-show-time">
                        <strong>{formatCinemaTime(show.startTime)}</strong>
                        <small>{formatCinemaDate(show.startTime)}{show.format ? ` · ${show.format}` : ""}</small>
                      </span>
                      <span className="available-show-screen">
                        <strong>{screen.name || "Screen unavailable"}</strong>
                        <small>{screen.screenType || "Screen type unavailable"}</small>
                      </span>
                      <span className="available-show-price">
                        {priceRange ? `${priceRange} / seat` : "Pricing unavailable"}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="empty-inline" role="status">
                No shows available for this movie and location yet.
              </div>
            )}
          </section>
          {selectedShow && (
            <section className="booking-step">
              <div className="seat-section-heading">
                <StepHeading number="02" title="Pick your seats" helper="Availability and pricing are provided by the selected show." />
                <button className="text-button seat-refresh" type="button" onClick={() => setSeatLoadAttempt((attempt) => attempt + 1)} disabled={seatsLoading}>
                  {seatsLoading ? "Refreshing..." : "Refresh seats"}
                </button>
              </div>
              {seatsLoading ? (
                <div className="empty-inline" role="status">Loading live seat availability...</div>
              ) : seatsError ? (
                <div className="show-discovery-error" role="alert">
                  <p>{seatsError}</p>
                  <button className="text-button" type="button" onClick={() => setSeatLoadAttempt((attempt) => attempt + 1)}>
                    Try again
                  </button>
                </div>
              ) : showSeats.length === 0 ? (
                <div className="empty-inline" role="status">No seats are available for this show.</div>
              ) : (
                <>
                  <div className="seat-availability-summary" aria-live="polite">
                    <span>{seatCounts.available || 0} available</span>
                    <span>{seatCounts.locked || 0} held</span>
                    <span>{seatCounts.booked || 0} booked</span>
                    <span>Maximum 10 seats</span>
                  </div>
                  <div className="seat-map">
                    <div className="screen-curve"><span>SCREEN</span></div>
                    <div className="seat-chart">
                      {seatRows.map((row) => (
                        <div
                          className="seat-row"
                          key={row.label}
                          style={{ "--seat-count": row.seats.length }}
                        >
                          <span className="row-label">{row.label}</span>
                          {row.seats.map((showSeat) => {
                            const seat = showSeat.seat;
                            const seatId = String(seat._id);
                            const seatCode = seat.seatCode || `${seat.rowLabel}${seat.seatNumber}`;
                            const selected = selectedSeatIds.includes(seatId);
                            const isOwnLock = showSeat.status === "locked" &&
                              String(showSeat.lockedBy?._id || showSeat.lockedBy || "") === String(profile?.id || "");
                            const price = selectedShow.seatPricing?.[seat.seatType];
                            const hasPrice = typeof price === "number" &&
                              Number.isFinite(price) &&
                              price >= 0;
                            const statusLabel = showSeat.status === "available"
                              ? "available"
                              : showSeat.status === "booked"
                                ? "booked"
                                : isOwnLock
                                  ? "held by you"
                                  : "held by another customer";
                            const categoryLabel = seat.seatType
                              ? `${seat.seatType[0].toUpperCase()}${seat.seatType.slice(1)}`
                              : "Uncategorized";
                            const ariaLabel = `${seatCode}, ${categoryLabel}, ${statusLabel}, ${hasPrice ? formatSeatPrice(price) : "pricing unavailable"}`;

                            return (
                              <button
                                key={seatId}
                                type="button"
                                disabled={showSeat.status !== "available" || !hasPrice || Boolean(activeSeatLock)}
                                aria-label={ariaLabel}
                                aria-pressed={selected}
                                title={ariaLabel}
                                className={`seat ${showSeat.status === "booked" ? "occupied" : ""} ${showSeat.status === "locked" ? (isOwnLock ? "held-by-you" : "locked") : ""} ${selected ? "chosen" : ""}`}
                                onClick={() => toggleSeat(seatId)}
                              >
                                {seat.seatNumber}
                              </button>
                            );
                          })}
                          <span className="row-label">{row.label}</span>
                        </div>
                      ))}
                    </div>
                    <div className="seat-legend">
                      <span><i /> Available</span>
                      <span><i className="legend-selected" /> Selected</span>
                      <span><i className="legend-locked" /> Held</span>
                      <span><i className="legend-occupied" /> Booked</span>
                    </div>
                  </div>
                  {selectedSeatData.length > 0 && (
                    <div className="selected-seat-details" aria-label="Selected seat details">
                      {selectedSeatData.map((showSeat) => {
                        const seat = showSeat.seat;
                        const price = selectedShow.seatPricing?.[seat.seatType];
                        return (
                          <span key={String(seat._id)}>
                            <strong>{seat.seatCode || `${seat.rowLabel}${seat.seatNumber}`}</strong>
                            {seat.seatType} · {typeof price === "number" && Number.isFinite(price) ? formatSeatPrice(price) : "Pricing unavailable"}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </section>
          )}
          <section className="booking-step">
            <StepHeading number={selectedShow ? "03" : "02"} title="Temporary seat hold" helper="The backend holds selected seats for five minutes. This does not confirm a booking." />
            {activeSeatLock && (
              <div className="seat-lock-confirmation" role="status">
                <strong>Seats held until {formatSeatHoldExpiry(activeSeatLock.expiresAt)}</strong>
                <span>The server confirmed this temporary hold. Payment and booking confirmation are not available here.</span>
              </div>
            )}
            {lockNotice && <div className="empty-inline" role="status">{lockNotice}</div>}
          </section>
        </div>
        <aside className="booking-summary">
          <span className="section-kicker">YOUR EVENING</span>
          <h2>Booking summary</h2>
          <div className="summary-movie"><div className="summary-poster" style={{ backgroundImage: `url("${movie.image}")` }} /><div><strong>{movie.title}</strong><span>{movie.genre} · {movie.duration}</span></div></div>
          <div className="summary-detail"><span><Icon name="film" size={15} /> Cinema</span><strong>{selectedTheatre?.name || "Choose a show"}</strong>{selectedTheatre && <small>{selectedTheatre.location}</small>}</div>
          <div className="summary-detail"><span><Icon name="calendar" size={15} /> Date & time</span><strong>{showtime ? `${showDate} · ${showtime}` : "Choose a show"}</strong></div>
          {selectedShow && <div className="summary-detail"><span><Icon name="film" size={15} /> Screen</span><strong>{selectedShow.screen?.name || "Screen unavailable"}</strong></div>}
          <div className="summary-detail"><span><Icon name="ticket" size={15} /> Seats</span><strong>{selectedSeatData.length ? selectedSeatData.map(({ seat }) => seat.seatCode || `${seat.rowLabel}${seat.seatNumber}`).join(", ") : "Choose your seats"}</strong></div>
          <div className="summary-total"><span>{activeSeatLock ? "Backend-locked total" : "Selected seat total"}</span><strong>{selectedShow && selectedSeatData.length ? formatSeatPrice(displayedTotal) : "—"}</strong></div>
          {lockError && <p className="form-error" role="alert">{lockError}</p>}
          <button className="button button-primary summary-submit" type="button" onClick={handleSeatLockAction} disabled={!hasValidSeatSelection || seatsLoading || lockLoading || Boolean(activeSeatLock)}>
            {isGuest ? "Log in to hold seats" : lockLoading ? "Locking seats..." : activeSeatLock ? "Seats held" : "Lock selected seats"}
          </button>
          <p className="summary-note">{isGuest ? "Sign in to place a temporary seat hold. Payment and booking confirmation are disabled." : "Seat locks expire after five minutes. Payment and booking confirmation are disabled."}</p>
        </aside>
      </div>
    </main>
  );
}

function StepHeading({ number, title, helper }) {
  return <div className="step-heading"><span className="step-number">{number}</span><div><h2>{title}</h2><p>{helper}</p></div></div>;
}

function BookingsPage({ movies, profile }) {
  const [bookings, setBookings] = useState(getBookings());
  const [message, setMessage] = useState("");
  const ownedBookings = bookings.filter((booking) => !profile || booking.email.toLowerCase() === profile.email.toLowerCase());

  function handleCancel(id) {
    cancelBooking(id);
    setBookings(getBookings());
    setMessage("Booking cancelled. Those seats are available again.");
  }

  return (
    <main className="content-page bookings-page">
      <div className="page-eyebrow"><span className="section-kicker">YOUR CINEMA JOURNAL</span><h1>My <em>bookings.</em></h1><p>All the stories you’ve got tickets for, in one place.</p></div>
      {message && <div className="inline-notice" role="status">{message}</div>}
      {!ownedBookings.length ? <div className="empty-panel booking-empty"><span className="empty-ticket"><Icon name="ticket" size={24} /></span><h2>No tickets in your pocket yet.</h2><p>Your next favorite movie night is just around the corner.</p><Link className="button button-primary" to="/">Explore movies <Icon name="arrow" size={15} /></Link></div> : (
        <div className="booking-list">{ownedBookings.map((booking) => {
          const movie = movies.find((item) => item.id === booking.movieId);
          return <article className={`booking-ticket ${booking.status === "Cancelled" ? "cancelled" : ""}`} key={booking.id}><div className="ticket-art" style={{ backgroundImage: `url("${booking.movieImage}")` }} /><div className="ticket-info"><span className={`status-pill ${booking.status.toLowerCase()}`}>{booking.status}</span><h2>{booking.movieTitle}</h2><p><Icon name="calendar" size={14} /> {booking.showDate} · {booking.showtime}</p><p><Icon name="pin" size={14} /> {booking.theatreName} · {booking.theatreLocation}</p><p><Icon name="ticket" size={14} /> Seats {booking.seats.join(", ")}</p><span className="booking-reference">BOOKING REF · {booking.id}</span></div><div className="ticket-actions">{movie && <Link className="text-button" to={`/movies/${movie.id}`}>Movie details <Icon name="arrow" size={14} /></Link>}{booking.status !== "Cancelled" && <button className="text-button cancel-action" type="button" onClick={() => handleCancel(booking.id)}>Cancel booking <Icon name="close" size={14} /></button>}</div></article>;
        })}</div>
      )}
    </main>
  );
}

function PasswordInput({ id, label, value, onChange, autoComplete, error, invalid = false }) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div className="auth-field">
      <label htmlFor={id}>{label}</label>
      <div className={`auth-password-control ${invalid ? "is-invalid" : ""}`}>
        <input
          id={id}
          type={isVisible ? "text" : "password"}
          value={value}
          onChange={onChange}
          autoComplete={autoComplete}
          minLength={8}
          required
          aria-invalid={Boolean(error || invalid)}
        />
        <button
          className="password-visibility-toggle"
          type="button"
          onClick={() => setIsVisible((visible) => !visible)}
          aria-label={`${isVisible ? "Hide" : "Show"} ${label.toLowerCase()}`}
          title={isVisible ? "Hide password" : "Show password"}
        >
          <Icon name={isVisible ? "eyeOff" : "eye"} size={17} />
        </button>
        {invalid && <span className="auth-password-error-icon"><Icon name="alert" size={18} /></span>}
      </div>
      {error && <p className="auth-inline-error" role="alert">{error}</p>}
    </div>
  );
}

function readPendingRegistration() {
  try {
    const stored = sessionStorage.getItem(PENDING_REGISTRATION_SESSION_KEY);
    if (!stored) {
      return null;
    }

    const registration = JSON.parse(stored);
    if (
      !registration ||
      typeof registration.email !== "string" ||
      typeof registration.phone !== "string" ||
      registration.emailVerified === true && registration.phoneVerified === true
    ) {
      sessionStorage.removeItem(PENDING_REGISTRATION_SESSION_KEY);
      return null;
    }
    return registration;
  } catch {
    return null;
  }
}

function RegistrationOtpPage({ registration, onRegistrationUpdate, onComplete }) {
  const [verification, setVerification] = useState({
    email: registration.emailVerified === true,
    mobile: registration.phoneVerified === true,
  });
  const [delivery, setDelivery] = useState(registration.delivery || { email: "accepted", mobile: "accepted" });
  const [codes, setCodes] = useState({ email: "", mobile: "" });
  const [errors, setErrors] = useState({ email: "", mobile: "" });
  const [cooldowns, setCooldowns] = useState({
    email: registration.emailVerified ? 0 : registration.resendAfterSeconds || 0,
    mobile: registration.phoneVerified ? 0 : registration.resendAfterSeconds || 0,
  });
  const [busyChannel, setBusyChannel] = useState("");

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCooldowns((current) => ({
        email: Math.max(0, current.email - 1),
        mobile: Math.max(0, current.mobile - 1),
      }));
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  async function verify(channel) {
    setErrors((current) => ({ ...current, [channel]: "" }));
    if (!/^\d{6}$/.test(codes[channel])) {
      setErrors((current) => ({ ...current, [channel]: "Enter the six-digit code." }));
      return;
    }

    setBusyChannel(channel);
    try {
      const response = await verifyRegistrationOtp({
        email: registration.email,
        channel,
        otp: codes[channel],
      });
      setVerification({
        email: response.verification.emailVerified,
        mobile: response.verification.phoneVerified,
      });
      setCodes((current) => ({ ...current, [channel]: "" }));
      onRegistrationUpdate({
        emailVerified: response.verification.emailVerified,
        phoneVerified: response.verification.phoneVerified,
      });
      if (response.token && response.user) {
        onComplete(response);
      }
    } catch (error) {
      setErrors((current) => ({
        ...current,
        [channel]: error instanceof Error ? error.message : "Unable to verify this code.",
      }));
    } finally {
      setBusyChannel("");
    }
  }

  async function resend(channel) {
    setErrors((current) => ({ ...current, [channel]: "" }));
    setBusyChannel(channel);
    try {
      const response = await resendRegistrationOtp({
        email: registration.email,
        channel,
      });
      setDelivery((current) => ({ ...current, [channel]: "accepted" }));
      setCooldowns((current) => ({
        ...current,
        [channel]: response.resendAfterSeconds || 45,
      }));
      onRegistrationUpdate({
        delivery: { ...delivery, [channel]: "accepted" },
        resendAfterSeconds: response.resendAfterSeconds || 45,
      });
    } catch (error) {
      setDelivery((current) => ({ ...current, [channel]: "failed" }));
      setCooldowns((current) => ({ ...current, [channel]: 45 }));
      setErrors((current) => ({
        ...current,
        [channel]: error instanceof Error ? error.message : "Unable to resend the code.",
      }));
    } finally {
      setBusyChannel("");
    }
  }

  function channelSection(channel, label, address) {
    const isVerified = verification[channel];
    const deliveryStatus = delivery[channel];
    return (
      <section className="otp-channel-card" aria-label={`${label} verification`}>
        <div className="otp-channel-heading">
          <div><h3>{label}</h3><p>{address}</p></div>
          <span className={`verification-status ${isVerified ? "is-verified" : deliveryStatus === "failed" ? "is-failed" : ""}`} role="status">
            {isVerified ? "Verified" : deliveryStatus === "failed" ? "Delivery issue" : "Delivery requested"}
          </span>
        </div>
        {!isVerified && (
          <>
            <label className="otp-code-label" htmlFor={`${channel}-otp`}>Six-digit code</label>
            <input
              id={`${channel}-otp`}
              className="otp-code-input"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={codes[channel]}
              onChange={(event) => {
                setCodes((current) => ({ ...current, [channel]: event.target.value.replace(/\D/g, "").slice(0, 6) }));
                setErrors((current) => ({ ...current, [channel]: "" }));
              }}
              aria-invalid={Boolean(errors[channel])}
            />
            {errors[channel] && <p className="auth-inline-error" role="alert">{errors[channel]}</p>}
            <div className="otp-channel-actions">
              <button className="button button-primary" type="button" onClick={() => verify(channel)} disabled={Boolean(busyChannel)}>
                {busyChannel === channel ? "Please wait..." : `Verify ${label}`}
              </button>
              <button className="otp-resend-button" type="button" onClick={() => resend(channel)} disabled={Boolean(busyChannel) || cooldowns[channel] > 0}>
                {cooldowns[channel] > 0 ? `Resend in ${cooldowns[channel]}s` : "Resend code"}
              </button>
            </div>
          </>
        )}
      </section>
    );
  }

  return (
    <main className="auth-page auth-page-single">
      <div className="auth-card auth-card-recovery otp-verification-page">
        <span className="section-kicker">TESSERACT FILMS</span>
        <h2>Verify Your Contact Details</h2>
        <p>Enter the separate codes once received. Both contacts must be verified before your account is activated.</p>
        {channelSection("email", "Email", registration.email)}
        {channelSection("mobile", "Mobile", registration.phone)}
      </div>
    </main>
  );
}

function AuthPage({ mode, onLogin, requestedReturnTo }) {
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = getSafeReturnTo(
    requestedReturnTo ||
    location.state?.returnTo ||
    new URLSearchParams(location.search).get("returnTo"),
  );
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingRegistration, setPendingRegistration] = useState(
    () => mode === "register" ? readPendingRegistration() : null
  );

  useEffect(() => {
    if (mode !== "register") {
      return;
    }
    try {
      if (pendingRegistration) {
        sessionStorage.setItem(PENDING_REGISTRATION_SESSION_KEY, JSON.stringify(pendingRegistration));
      } else {
        sessionStorage.removeItem(PENDING_REGISTRATION_SESSION_KEY);
      }
    } catch {
      setError({
        message: "This browser could not save the pending verification session. Keep this tab open until both codes are verified.",
        kind: "general",
      });
    }
  }, [mode, pendingRegistration]);

  async function submit(event) {
    event.preventDefault();
    setError(null);

    if (mode === "register") {
      const emailField = event.currentTarget.elements.namedItem("email");
      const normalizedPhone = phone.trim().replace(/[\s().-]/g, "");
      if (name.trim().length < 2 || name.trim().length > 100) {
        setError({ message: "Enter your full name (2–100 characters).", kind: "general" });
        return;
      }
      if (!email.trim() || !emailField.validity.valid) {
        setError({ field: "email", message: "Enter a valid email address.", kind: "validation" });
        return;
      }
      if (!/^\+[1-9]\d{7,14}$/.test(normalizedPhone)) {
        setError({ field: "phone", message: "Use international format, including the country code (for example, +91...).", kind: "validation" });
        return;
      }
      if (password.length < 8) {
        setError({ field: "password", message: "Password must be at least 8 characters.", kind: "validation" });
        return;
      }
      if (password !== confirmPassword) {
        setError({ field: "confirmPassword", message: "The passwords do not match.", kind: "validation" });
        return;
      }
    } else {
      if (!identifier.trim()) {
        setError({ message: "Enter your email address or mobile number.", kind: "general" });
        return;
      }
      if (!password) {
        setError({ field: "password", message: "Enter your password.", kind: "validation" });
        return;
      }
    }

    setIsSubmitting(true);
    try {
      if (mode === "register") {
        const response = await registerUser({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          phone: phone.trim(),
          password,
          confirmPassword,
        });
        setPassword("");
        setConfirmPassword("");
        setPendingRegistration(response.registration);
        return;
      }

      const authResponse = await loginUser({
        identifier: identifier.trim(),
        password,
      });
      onLogin(authResponse, returnTo);
    } catch (authError) {
      if (mode === "sign-in" && authError instanceof AuthApiError && authError.status === 401) {
        setError({
          field: "password",
          message: "Invalid email/mobile number or password. Please check your credentials and try again.",
          kind: "credentials",
        });
      } else {
        setError({
          message: authError instanceof Error ? authError.message : "Authentication failed. Please try again.",
          kind: "general",
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  function completeRegistration(authResponse) {
    try {
      sessionStorage.removeItem(PENDING_REGISTRATION_SESSION_KEY);
    } catch {
      setError({
        message: "Your account is active, but this browser could not clear its pending registration data.",
        kind: "general",
      });
    }
    onLogin(authResponse, returnTo);
  }

  if (pendingRegistration) {
    return (
      <RegistrationOtpPage
        registration={pendingRegistration}
        onRegistrationUpdate={(updates) => setPendingRegistration((current) => ({ ...current, ...updates }))}
        onComplete={completeRegistration}
      />
    );
  }

  return (
    <main className="auth-page">
      <div className="auth-art"><span className="section-kicker">WELCOME TO YOUR HAPPY PLACE</span><h1>Let the<br /><em>good stories</em><br />find you.</h1><p>Your next great night out is just a few clicks away.</p></div>
      <form className="auth-card" onSubmit={submit} noValidate>
        <span className="section-kicker">YOUR TESSERACT FILMS ACCOUNT</span><h2>{mode === "sign-in" ? "Welcome back." : "Join the audience."}</h2><p>Keep your tickets, bookings, and favorite films together.</p>
        {mode === "register" && (
          <>
            <div className="auth-field">
              <label htmlFor="auth-name">Full Name</label>
              <input id="auth-name" name="name" value={name} onChange={(event) => { setName(event.target.value); setError(null); }} autoComplete="name" placeholder="Alex Morgan" required />
            </div>
            <div className="auth-field">
              <label htmlFor="auth-email">Email Address</label>
              <input id="auth-email" name="email" value={email} onChange={(event) => { setEmail(event.target.value); setError(null); }} type="email" autoComplete="email" placeholder="you@example.com" required aria-invalid={error?.field === "email"} />
              {error?.field === "email" && <p className="auth-inline-error" role="alert">{error.message}</p>}
            </div>
            <div className="auth-field">
              <label htmlFor="auth-phone">Mobile Number</label>
              <input id="auth-phone" name="phone" value={phone} onChange={(event) => { setPhone(event.target.value); setError(null); }} type="tel" autoComplete="tel" placeholder="+91 98765 43210" required aria-invalid={error?.field === "phone"} />
              {error?.field === "phone" && <p className="auth-inline-error" role="alert">{error.message}</p>}
            </div>
            <PasswordInput
              id="auth-password"
              label="Password"
              value={password}
              onChange={(event) => { setPassword(event.target.value); setError(null); }}
              autoComplete="new-password"
              error={error?.field === "password" ? error.message : ""}
            />
            <PasswordInput
              id="auth-confirm-password"
              label="Confirm Password"
              value={confirmPassword}
              onChange={(event) => { setConfirmPassword(event.target.value); setError(null); }}
              autoComplete="new-password"
              error={error?.field === "confirmPassword" ? error.message : ""}
            />
          </>
        )}
        {mode === "sign-in" && (
          <>
            <div className="auth-field">
              <label htmlFor="auth-identifier">Email Address or Mobile Number</label>
              <input id="auth-identifier" name="identifier" value={identifier} onChange={(event) => { setIdentifier(event.target.value); setError(null); }} autoComplete="username" placeholder="you@example.com or +91..." required aria-invalid={Boolean(error?.kind === "credentials")} />
            </div>
            <PasswordInput
              id="auth-password"
              label="Password"
              value={password}
              onChange={(event) => { setPassword(event.target.value); setError(null); }}
              autoComplete="current-password"
              error={error?.field === "password" ? error.message : ""}
              invalid={error?.kind === "credentials"}
            />
            <Link className="forgot-password-link" to={getAuthPath("/forgot-password", returnTo)}>Forgot Password?</Link>
          </>
        )}
        <p className="demo-caption">{mode === "register" ? "Verify both your email and mobile number to activate your account." : "Your account is protected by secure sign-in."}</p>
        {error?.kind === "general" && <p className="auth-inline-error" role="alert">{error.message}</p>}
        <button className="button button-primary auth-submit" type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Please wait..." : mode === "sign-in" ? "Log in" : "Continue to verification"}
          <Icon name="arrow" size={16} />
        </button>
        <p className="auth-switch">
          {mode === "sign-in" ? "New to Tesseract Films?" : "Already have an account?"}
          {" "}
          <button
            type="button"
            onClick={() => navigate(getAuthPath(mode === "sign-in" ? "/register" : "/sign-in", returnTo))}
          >
            {mode === "sign-in" ? "Sign up" : "Log in"}
          </button>
        </p>
      </form>
    </main>
  );
}

function ForgotPasswordPage({ returnTo }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError("");

    const emailField = event.currentTarget.elements.namedItem("email");
    if (!email.trim()) {
      setError("Enter your email address.");
      return;
    }
    if (!emailField.validity.valid) {
      setError("Enter a valid email address.");
      return;
    }

    setIsSubmitting(true);
    try {
      await requestPasswordReset({ email: email.trim().toLowerCase() });
      setIsSubmitted(true);
    } catch (requestError) {
      setError(requestError instanceof Error
        ? requestError.message
        : "Unable to request a password reset right now. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-page auth-page-single">
      <form className="auth-card auth-card-recovery" onSubmit={submit} noValidate>
        <span className="section-kicker">TESSERACT FILMS</span>
        <h2>Forgot Your Password?</h2>
        <p>Enter your registered email address and we'll send you a password reset link.</p>
        {isSubmitted ? (
          <p className="auth-success-message" role="status">
            If an account exists for that email, we will send a reset link if email delivery is available. If you do not receive it, please try again later.
          </p>
        ) : (
          <>
            <div className="auth-field">
              <label htmlFor="reset-request-email">Email address</label>
              <input
                id="reset-request-email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(event) => { setEmail(event.target.value); setError(""); }}
                aria-invalid={Boolean(error)}
                required
              />
              {error && <p className="auth-inline-error" role="alert">{error}</p>}
            </div>
            <button className="button button-primary auth-submit" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Please wait..." : "Send Reset Link"}
              <Icon name="arrow" size={16} />
            </button>
          </>
        )}
        <Link className="auth-return-link" to={getAuthPath("/sign-in", returnTo)}>Back to Login</Link>
      </form>
    </main>
  );
}

function ResetPasswordPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const token = new URLSearchParams(location.search).get("token") || "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isComplete, setIsComplete] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Your password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    try {
      await resetPassword({ token, password });
      navigate("/reset-password", { replace: true });
      setIsComplete(true);
    } catch (resetError) {
      setError(resetError instanceof Error
        ? resetError.message
        : "Unable to update your password. Please request a new reset link.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-page auth-page-single">
      <form className="auth-card auth-card-recovery" onSubmit={submit} noValidate>
        <span className="section-kicker">TESSERACT FILMS</span>
        <h2>{isComplete ? "Password Updated" : "Create a New Password"}</h2>
        {isComplete ? (
          <>
            <p className="auth-success-message" role="status">Your password has been updated successfully. You can now log in with your new password.</p>
            <Link className="button button-primary auth-submit" to="/sign-in">Back to Login <Icon name="arrow" size={16} /></Link>
          </>
        ) : !token ? (
          <>
            <p className="auth-inline-error" role="alert">This password reset link is invalid or has expired.</p>
            <Link className="auth-return-link" to="/forgot-password">Request a new reset link</Link>
          </>
        ) : (
          <>
            <p>Choose a new password for your Tesseract Films account.</p>
            <PasswordInput
              id="new-password"
              label="New Password"
              value={password}
              onChange={(event) => { setPassword(event.target.value); setError(""); }}
              autoComplete="new-password"
            />
            <PasswordInput
              id="confirm-new-password"
              label="Confirm New Password"
              value={confirmPassword}
              onChange={(event) => { setConfirmPassword(event.target.value); setError(""); }}
              autoComplete="new-password"
            />
            {error && <p className="auth-inline-error" role="alert">{error}</p>}
            <button className="button button-primary auth-submit" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Please wait..." : "Update Password"}
              <Icon name="arrow" size={16} />
            </button>
            <Link className="auth-return-link" to="/sign-in">Back to Login</Link>
          </>
        )}
      </form>
    </main>
  );
}

function ProfilePage({ profile, token, onProfileChange }) {
  const [phone, setPhone] = useState(profile.pendingPhone || profile.phone || "");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(() => {
    const availableAt = profile.phoneOtpResendAt ? new Date(profile.phoneOtpResendAt).getTime() : 0;
    return Math.max(0, Math.ceil((availableAt - Date.now()) / 1000));
  });

  useEffect(() => {
    const timer = window.setInterval(() => {
      setResendSeconds((seconds) => Math.max(0, seconds - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  async function sendCode() {
    setError("");
    setNotice("");
    const normalizedPhone = phone.trim().replace(/[\s().-]/g, "");
    if (!/^\+[1-9]\d{7,14}$/.test(normalizedPhone)) {
      setError("Enter a valid mobile number in international format, including its country code.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await requestMobileVerification({ phone: normalizedPhone }, token);
      setPhone(response.pendingPhone);
      setResendSeconds(response.resendAfterSeconds || 45);
      onProfileChange({
        pendingPhone: response.pendingPhone,
        phoneVerified: false,
        phoneOtpResendAt: new Date(Date.now() + (response.resendAfterSeconds || 45) * 1000).toISOString(),
      });
      setNotice("The SMS provider accepted the verification request. Check your mobile number for the code.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to send a verification code.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function resendCode() {
    setError("");
    setNotice("");
    setIsSubmitting(true);
    try {
      const response = await resendMobileVerification(token);
      setResendSeconds(response.resendAfterSeconds || 45);
      onProfileChange({
        phoneOtpResendAt: new Date(Date.now() + (response.resendAfterSeconds || 45) * 1000).toISOString(),
      });
      setNotice("The SMS provider accepted the new verification request. Check your mobile number for the code.");
    } catch (requestError) {
      setResendSeconds(45);
      setError(requestError instanceof Error ? requestError.message : "Unable to resend the verification code.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function verifyCode(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    if (!/^\d{6}$/.test(otp)) {
      setError("Enter the six-digit verification code.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await verifyMobileNumber({ otp }, token);
      onProfileChange(response.user);
      setOtp("");
      setNotice("Your mobile number is verified.");
    } catch (verifyError) {
      setError(verifyError instanceof Error ? verifyError.message : "Unable to verify this code.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="content-page profile-page">
      <div className="page-eyebrow">
        <span className="section-kicker">YOUR TESSERACT FILMS ACCOUNT</span>
        <h1>Account <em>details.</em></h1>
        <p>Keep your contact information up to date and verified.</p>
      </div>
      <section className="profile-contact-card">
        <span className="section-kicker">MOBILE NUMBER</span>
        <h2>{profile.phoneVerified ? "Mobile verified" : profile.pendingPhone ? "Verify your mobile" : "Add a mobile number"}</h2>
        <p>{profile.phoneVerified ? "Your mobile number is ready for account recovery and future updates." : "We’ll send a one-time code to confirm that this number belongs to you."}</p>
        {profile.phoneVerified ? (
          <div className="verification-status is-verified" role="status">{profile.phone}</div>
        ) : !profile.pendingPhone ? (
          <>
            <div className="auth-field">
              <label htmlFor="profile-phone">Mobile Number</label>
              <input id="profile-phone" type="tel" autoComplete="tel" placeholder="+91 98765 43210" value={phone} onChange={(event) => setPhone(event.target.value)} />
            </div>
            <button className="button button-primary auth-submit" type="button" onClick={sendCode} disabled={isSubmitting}>
              {isSubmitting ? "Please wait..." : "Send Verification Code"}
            </button>
          </>
        ) : (
          <form onSubmit={verifyCode}>
            <p className="profile-pending-phone">Code requested for <strong>{profile.pendingPhone}</strong></p>
            <div className="auth-field">
              <label htmlFor="profile-phone-otp">Six-digit code</label>
              <input id="profile-phone-otp" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))} />
            </div>
            <div className="otp-channel-actions">
              <button className="button button-primary" type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Please wait..." : "Verify Mobile"}
              </button>
              <button className="otp-resend-button" type="button" onClick={resendCode} disabled={isSubmitting || resendSeconds > 0}>
                {resendSeconds > 0 ? `Resend in ${resendSeconds}s` : "Resend code"}
              </button>
            </div>
          </form>
        )}
        {notice && <p className="auth-success-message" role="status">{notice}</p>}
        {error && <p className="auth-inline-error" role="alert">{error}</p>}
      </section>
    </main>
  );
}

function AdminPage({ movies, onMoviesChange }) {
  const [theatres, setTheatresState] = useState(getTheatres());
  const [showtimes, setShowtimesState] = useState(getShowtimes());
  const [bookings, setBookingsState] = useState(getBookings());
  const [title, setTitle] = useState("");
  const [genre, setGenre] = useState("Drama");
  const [poster, setPoster] = useState("");
  const [theatreName, setTheatreName] = useState("");
  const [theatreLocation, setTheatreLocation] = useState("");
  const [showtimeDraft, setShowtimeDraft] = useState("");
  const [editingMovie, setEditingMovie] = useState("");
  const [movieTitleDraft, setMovieTitleDraft] = useState("");
  const [movieGenreDraft, setMovieGenreDraft] = useState("Drama");
  const [editingTheatre, setEditingTheatre] = useState("");
  const [theatreNameDraft, setTheatreNameDraft] = useState("");
  const [theatreLocationDraft, setTheatreLocationDraft] = useState("");
  const [editingShowtime, setEditingShowtime] = useState("");
  const [notice, setNotice] = useState("");

  function refreshNotice(message) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 3000);
  }

  function addMovie(event) {
    event.preventDefault();
    const movie = { id: `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`, title: title.trim(), genre, rating: "New", duration: "1h 45m", language: "English", release: "Now Showing", label: "NEW", year: String(new Date().getFullYear()), synopsis: "More details coming soon.", image: poster.trim() || "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=1200&q=85" };
    const next = [movie, ...movies];
    saveMovies(next);
    onMoviesChange(next);
    setTitle("");
    setPoster("");
    refreshNotice(`${movie.title} added to Now Showing.`);
  }

  function removeMovie(id) {
    const next = movies.filter((movie) => movie.id !== id);
    saveMovies(next);
    onMoviesChange(next);
    refreshNotice("Movie removed from the catalogue.");
  }

  function beginEditMovie(movie) {
    setEditingMovie(movie.id);
    setMovieTitleDraft(movie.title);
    setMovieGenreDraft(movie.genre);
  }

  function updateMovie(event, id) {
    event.preventDefault();
    const next = movies.map((movie) => movie.id === id
      ? { ...movie, title: movieTitleDraft.trim(), genre: movieGenreDraft }
      : movie);
    saveMovies(next);
    onMoviesChange(next);
    setEditingMovie("");
    refreshNotice("Movie details updated.");
  }

  function toggleMovieRelease(movie) {
    const release = movie.release === "Coming Soon" ? "Now Showing" : "Coming Soon";
    const next = movies.map((item) => item.id === movie.id ? { ...item, release } : item);
    saveMovies(next);
    onMoviesChange(next);
    refreshNotice(`${movie.title} moved to ${release}.`);
  }

  function addTheatre(event) {
    event.preventDefault();
    const next = [{ id: `${theatreName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`, name: theatreName.trim(), location: theatreLocation.trim(), formats: "Standard · Digital" }, ...theatres];
    saveTheatres(next);
    setTheatresState(next);
    setTheatreName("");
    setTheatreLocation("");
    refreshNotice("Theatre added.");
  }

  function removeTheatre(id) {
    const next = theatres.filter((theatre) => theatre.id !== id);
    saveTheatres(next);
    setTheatresState(next);
    refreshNotice("Theatre removed.");
  }

  function beginEditTheatre(theatre) {
    setEditingTheatre(theatre.id);
    setTheatreNameDraft(theatre.name);
    setTheatreLocationDraft(theatre.location);
  }

  function updateTheatre(event, id) {
    event.preventDefault();
    const next = theatres.map((theatre) => theatre.id === id
      ? { ...theatre, name: theatreNameDraft.trim(), location: theatreLocationDraft.trim() }
      : theatre);
    saveTheatres(next);
    setTheatresState(next);
    setEditingTheatre("");
    refreshNotice("Theatre details updated.");
  }

  function addShowtime(event) {
    event.preventDefault();
    const next = [...new Set([...showtimes, showtimeDraft.trim()])];
    saveShowtimes(next);
    setShowtimesState(next);
    setShowtimeDraft("");
    refreshNotice("Showtime added.");
  }

  function removeShowtime(time) {
    const next = showtimes.filter((item) => item !== time);
    saveShowtimes(next);
    setShowtimesState(next);
    refreshNotice("Showtime removed.");
  }

  function updateShowtime(event, previousTime) {
    event.preventDefault();
    const nextTime = showtimeDraft.trim();
    const next = [...new Set(showtimes.map((time) => time === previousTime ? nextTime : time))];
    saveShowtimes(next);
    setShowtimesState(next);
    setEditingShowtime("");
    setShowtimeDraft("");
    refreshNotice("Showtime updated.");
  }

  function updateBookingStatus(id, status) {
    setStoredBookingStatus(id, status);
    setBookingsState(getBookings());
    refreshNotice(`Booking ${status.toLowerCase()}.`);
  }

  function removeBooking(id) {
    deleteBooking(id);
    setBookingsState(getBookings());
    refreshNotice("Booking record removed.");
  }

  return (
    <main className="admin-page">
      <div className="admin-heading"><div><span className="section-kicker">THE HOUSE, BEHIND THE SCENES</span><h1>Control <em>room.</em></h1><p>Manage your catalogue, screens, showtimes, and bookings.</p></div><span className="admin-demo-chip">LOCAL DEMO MODE</span></div>
      {notice && <div className="inline-notice" role="status">{notice}</div>}
      <div className="admin-stats"><StatCard label="MOVIES" value={movies.length} detail="In your catalogue" /><StatCard label="THEATRES" value={theatres.length} detail="Available locations" /><StatCard label="SHOWTIMES" value={showtimes.length} detail="Across your screens" /><StatCard label="BOOKINGS" value={bookings.filter((booking) => booking.status !== "Cancelled").length} detail="Confirmed tickets" /></div>
      <section className="admin-panel"><div className="panel-heading"><div><span className="section-kicker">CATALOGUE</span><h2>Movie management</h2></div></div><form className="admin-add-form movie-add-form" onSubmit={addMovie}><label>Movie title<input value={title} onChange={(event) => setTitle(event.target.value)} required placeholder="New release title" /></label><label>Genre<select value={genre} onChange={(event) => setGenre(event.target.value)}>{genres.slice(1).map((item) => <option key={item}>{item}</option>)}</select></label><label>Poster image URL<input value={poster} onChange={(event) => setPoster(event.target.value)} type="url" placeholder="https://..." /></label><button className="button button-primary" type="submit"><Icon name="plus" size={15} /> Add movie</button></form><div className="admin-table">{movies.map((movie) => <div className="admin-row" key={movie.id}><span className="admin-movie-thumb" style={{ backgroundImage: `url("${movie.image}")` }} />{editingMovie === movie.id ? <form className="admin-row-edit movie-row-edit" onSubmit={(event) => updateMovie(event, movie.id)}><input aria-label={`Edit ${movie.title} title`} value={movieTitleDraft} onChange={(event) => setMovieTitleDraft(event.target.value)} required /><select aria-label={`Edit ${movie.title} genre`} value={movieGenreDraft} onChange={(event) => setMovieGenreDraft(event.target.value)}>{genres.slice(1).map((item) => <option key={item}>{item}</option>)}</select><button className="text-button" type="submit">Save</button></form> : <div className="admin-row-copy"><strong>{movie.title}</strong><span>{movie.genre} · {movie.release}</span></div>}<button className="text-button admin-edit-action" type="button" onClick={() => editingMovie === movie.id ? setEditingMovie("") : beginEditMovie(movie)}>{editingMovie === movie.id ? "Close" : "Edit"}</button><button className="text-button admin-edit-action" type="button" onClick={() => toggleMovieRelease(movie)}>{movie.release === "Coming Soon" ? "Now Showing" : "Coming Soon"}</button><button className="icon-button danger-icon" type="button" aria-label={`Remove ${movie.title}`} onClick={() => removeMovie(movie.id)}><Icon name="trash" size={16} /></button></div>)}</div></section>
      <div className="admin-columns">
        <section className="admin-panel"><div className="panel-heading"><div><span className="section-kicker">LOCATIONS</span><h2>Theatre management</h2></div></div><form className="admin-stacked-form" onSubmit={addTheatre}><input value={theatreName} onChange={(event) => setTheatreName(event.target.value)} required placeholder="Theatre name" /><input value={theatreLocation} onChange={(event) => setTheatreLocation(event.target.value)} required placeholder="Neighbourhood" /><button className="button button-subtle" type="submit"><Icon name="plus" size={15} /> Add theatre</button></form>{theatres.map((theatre) => <div className="simple-admin-row" key={theatre.id}>{editingTheatre === theatre.id ? <form className="theatre-row-edit" onSubmit={(event) => updateTheatre(event, theatre.id)}><input aria-label={`Edit ${theatre.name} name`} value={theatreNameDraft} onChange={(event) => setTheatreNameDraft(event.target.value)} required /><input aria-label={`Edit ${theatre.name} location`} value={theatreLocationDraft} onChange={(event) => setTheatreLocationDraft(event.target.value)} required /><button className="text-button" type="submit">Save</button></form> : <div><strong>{theatre.name}</strong><span>{theatre.location} · {theatre.formats}</span></div>}<button className="text-button admin-edit-action" type="button" onClick={() => editingTheatre === theatre.id ? setEditingTheatre("") : beginEditTheatre(theatre)}>{editingTheatre === theatre.id ? "Close" : "Edit"}</button><button className="icon-button danger-icon" type="button" aria-label={`Remove ${theatre.name}`} onClick={() => removeTheatre(theatre.id)}><Icon name="trash" size={15} /></button></div>)}</section>
        <section className="admin-panel"><div className="panel-heading"><div><span className="section-kicker">THE DAILY SCHEDULE</span><h2>Showtime management</h2></div></div><form className="admin-stacked-form showtime-add-form" onSubmit={addShowtime}><input value={showtimeDraft} onChange={(event) => setShowtimeDraft(event.target.value)} required placeholder="Example: 9:15 PM" /><button className="button button-subtle" type="submit"><Icon name="plus" size={15} /> Add time</button></form><div className="admin-time-list">{showtimes.map((time) => editingShowtime === time ? <form className="admin-time-edit" key={time} onSubmit={(event) => updateShowtime(event, time)}><input aria-label={`Edit showtime ${time}`} value={showtimeDraft} onChange={(event) => setShowtimeDraft(event.target.value)} required /><button type="submit">Save</button></form> : <span className="admin-time" key={time}>{time}<button type="button" aria-label={`Edit ${time}`} onClick={() => { setEditingShowtime(time); setShowtimeDraft(time); }}><span className="sr-only">Edit</span>✎</button><button type="button" aria-label={`Remove ${time}`} onClick={() => removeShowtime(time)}><Icon name="close" size={12} /></button></span>)}</div></section>
      </div>
      <section className="admin-panel admin-bookings"><div className="panel-heading"><div><span className="section-kicker">BOX OFFICE</span><h2>Booking management</h2></div></div>{bookings.length ? bookings.map((booking) => <div className="admin-row booking-admin-row" key={booking.id}><div className="admin-row-copy"><strong>{booking.movieTitle}</strong><span>{booking.name || booking.email} · {booking.theatreName} · {booking.showDate}, {booking.showtime} · Seats {booking.seats.join(", ")}</span></div><span className={`status-pill ${booking.status.toLowerCase()}`}>{booking.status}</span>{booking.status !== "Cancelled" && <button className="text-button cancel-action" type="button" onClick={() => updateBookingStatus(booking.id, "Cancelled")}>Cancel</button>}<button className="icon-button danger-icon" type="button" aria-label={`Remove booking ${booking.id}`} onClick={() => removeBooking(booking.id)}><Icon name="trash" size={14} /></button></div>) : <div className="empty-inline">Confirmed customer bookings will appear here.</div>}</section>
      <p className="admin-footnote">Changes are saved to this browser only. Connect an authenticated server before using this dashboard for a live cinema.</p>
    </main>
  );
}

function StatCard({ label, value, detail }) {
  return <article className="stat-card"><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>;
}

function NotFound() {
  return <main className="content-page not-found"><span className="section-kicker">THIS SCREEN IS EMPTY</span><h1>We couldn't find that <em>story.</em></h1><p>That page may have moved. The movies are still playing.</p><Link className="button button-primary" to="/">Back to movies <Icon name="arrow" size={15} /></Link></main>;
}

function MovieCatalogueStatus({ loading, error, onRetry }) {
  const title = loading
    ? "Loading the movie catalogue"
    : error
      ? "Unable to load movies"
      : "No movies are available";
  const message = loading
    ? "Please wait while we load the latest movies."
    : error || "There are no movies in the catalogue right now.";

  return (
    <main className="content-page">
      <div className="empty-panel" role={error ? "alert" : "status"}>
        <Icon name={loading ? "film" : "search"} size={24} />
        <h2>{title}</h2>
        <p>{message}</p>
        {!loading && <button className="button button-subtle" type="button" onClick={onRetry}>Try again</button>}
      </div>
    </main>
  );
}

function AppContent() {
  const location = useLocation();
  const navigate = useNavigate();
  const [movies, setMovies] = useState([]);
  const [movieDiscovery, setMovieDiscovery] = useState(null);
  const [discoveryLoading, setDiscoveryLoading] = useState(false);
  const [discoveryError, setDiscoveryError] = useState("");
  const [availableShows, setAvailableShows] = useState([]);
  const [showAvailabilityError, setShowAvailabilityError] = useState("");
  const [moviesLoading, setMoviesLoading] = useState(false);
  const [moviesError, setMoviesError] = useState("");
  const [movieLoadAttempt, setMovieLoadAttempt] = useState(0);
  const [session, setSession] = useState(null);
  const [guestAccess, setGuestAccess] = useState(false);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [sessionError, setSessionError] = useState("");
  const [sessionCheckAttempt, setSessionCheckAttempt] = useState(0);
  const catalogue = useMemo(
    () => mergeMovieCatalogues(movies, movieDiscovery),
    [movies, movieDiscovery],
  );
  const bookableMovieIds = useMemo(() => new Set(
    availableShows.map((show) => String(show.movie?._id || show.movie || "")),
  ), [availableShows]);

  useEffect(() => {
    document.title = "Tesseract Films — Your next great night out";
  }, []);

  useEffect(() => {
    let active = true;

    setSessionLoading(true);
    setSessionError("");

    restoreAuthSession()
      .then((restoredSession) => {
        if (active) {
          setSession(restoredSession);
        }
      })
      .catch((error) => {
        if (active) {
          if (error instanceof AuthApiError && error.status === 401) {
            try {
              clearAuthSession();
              setSessionError("Your saved session expired. Please sign in again.");
            } catch (clearError) {
              setSessionError(clearError.message);
            }
            setSession(null);
          } else {
            setSessionError(error instanceof Error ? error.message : "Unable to verify your saved session.");
          }
        }
      })
      .finally(() => {
        if (active) {
          setSessionLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [sessionCheckAttempt]);

  useEffect(() => {
    let active = true;

    if (!session && !guestAccess) {
      setMovies([]);
      setMovieDiscovery(null);
      setDiscoveryError("");
      setDiscoveryLoading(false);
      setMoviesError("");
      setMoviesLoading(false);
      return () => {
        active = false;
      };
    }

    setMoviesLoading(true);
    setMoviesError("");
    setDiscoveryLoading(true);
    setDiscoveryError("");

    fetchMovies()
      .then((backendMovies) => {
        if (active) {
          setMovies(backendMovies.map(mapBackendMovie));
        }
      })
      .catch((error) => {
        if (active) {
          setMovies([]);
          setMoviesError(error instanceof Error ? error.message : "Unable to load movies.");
        }
      })
      .finally(() => {
        if (active) {
          setMoviesLoading(false);
        }
      });

    fetchMovieDiscovery()
      .then((result) => {
        if (active) setMovieDiscovery(result);
      })
      .catch((error) => {
        if (active) {
          setMovieDiscovery(null);
          setDiscoveryError(error instanceof Error
            ? error.message
            : "TMDB movie discovery is currently unavailable.");
        }
      })
      .finally(() => {
        if (active) setDiscoveryLoading(false);
      });

    return () => {
      active = false;
    };
  }, [session, guestAccess, movieLoadAttempt]);

  useEffect(() => {
    let active = true;
    if (!session && !guestAccess) {
      setAvailableShows([]);
      setShowAvailabilityError("");
      return () => {
        active = false;
      };
    }

    setShowAvailabilityError("");
    fetchAvailableShows({})
      .then((shows) => {
        if (active) setAvailableShows(shows);
      })
      .catch(() => {
        if (active) {
          setAvailableShows([]);
          setShowAvailabilityError("Local show availability could not be verified. Ticket actions remain unavailable until the theatre service responds.");
        }
      });
    return () => {
      active = false;
    };
  }, [session, guestAccess]);

  function handleLogin(authResponse, returnTo) {
    const savedSession = saveAuthSession(authResponse);
    setSessionError("");
    setGuestAccess(false);
    setSession(savedSession);
    navigate(getSafeReturnTo(returnTo), { replace: true });
  }

  function handleProfileChange(userUpdates) {
    const updatedSession = saveAuthSession({
      token: session.token,
      user: { ...session.user, ...userUpdates },
    });
    setSession(updatedSession);
  }

  function handleLogout() {
    try {
      clearAuthSession();
      setSession(null);
      setGuestAccess(false);
      setMovies([]);
      setMovieDiscovery(null);
      setAvailableShows([]);
      setMoviesError("");
      setDiscoveryError("");
      setShowAvailabilityError("");
      setSessionError("");
      navigate("/", { replace: true });
    } catch (error) {
      setSessionError(error instanceof Error ? error.message : "Unable to sign out.");
    }
  }

  function continueAsGuest() {
    setSessionError("");
    setGuestAccess(true);
    navigate("/", { replace: true });
  }

  const currentReturnTo = `${location.pathname}${location.search}${location.hash}`;
  const authReturnTo = location.state?.returnTo ||
    new URLSearchParams(location.search).get("returnTo");

  function requestLogin(returnTo = currentReturnTo) {
    navigate("/login-required", {
      state: { returnTo: getSafeReturnTo(returnTo) },
    });
  }

  const catalogueUnavailable = catalogue.movies.length === 0;
  const catalogueStatus = (
    <MovieCatalogueStatus
      loading={moviesLoading || discoveryLoading}
      error={moviesError || discoveryError}
      onRetry={() => setMovieLoadAttempt((attempt) => attempt + 1)}
    />
  );
  const homeProps = {
    movies: catalogue.movies,
    localMovies: movies,
    categories: catalogue.categories,
    discoveryLoading,
    discoveryError,
    discoveryWarnings: movieDiscovery?.warnings || [],
    bookableMovieIds,
    showAvailabilityError,
  };

  if (sessionLoading) {
    return (
      <div className="app-shell">
        <main className="session-loading" role="status">Checking your sign-in session...</main>
      </div>
    );
  }

  if (!session) {
    if (location.pathname === "/sign-in" || location.pathname === "/register") {
      return (
        <div className="app-shell">
          <AuthPage
            key={location.pathname}
            mode={location.pathname === "/register" ? "register" : "sign-in"}
            onLogin={handleLogin}
            requestedReturnTo={authReturnTo}
          />
        </div>
      );
    }

    if (location.pathname === "/forgot-password") {
      return <div className="app-shell"><ForgotPasswordPage returnTo={authReturnTo} /></div>;
    }

    if (location.pathname === "/reset-password") {
      return <div className="app-shell"><ResetPasswordPage /></div>;
    }

    if (!guestAccess) {
      return (
        <div className="app-shell">
          <LandingPage
            sessionError={sessionError}
            onRetrySession={() => setSessionCheckAttempt((attempt) => attempt + 1)}
            onContinueAsGuest={continueAsGuest}
          />
        </div>
      );
    }

    return (
      <div className="app-shell">
        <Header
          isGuest
          returnTo={location.pathname === "/login-required"
            ? getSafeReturnTo(location.state?.returnTo)
            : currentReturnTo}
        />
        <Routes>
          <Route path="/" element={catalogueUnavailable ? catalogueStatus : <HomePage {...homeProps} />} />
          <Route path="/movies" element={catalogueUnavailable ? catalogueStatus : <MovieCataloguePage movies={catalogue.movies} categories={catalogue.categories} discoveryLoading={discoveryLoading} discoveryError={discoveryError} discoveryWarnings={movieDiscovery?.warnings || []} bookableMovieIds={bookableMovieIds} />} />
          <Route path="/movies/:movieId" element={catalogueUnavailable ? catalogueStatus : <MovieDetailsPage movies={catalogue.movies} localMovies={movies} bookableMovieIds={bookableMovieIds} showAvailabilityError={showAvailabilityError} />} />
          <Route
            path="/book/:movieId"
            element={catalogueUnavailable
              ? catalogueStatus
              : <BookingPage movies={movies} catalogueMovies={catalogue.movies} bookableMovieIds={bookableMovieIds} showAvailabilityError={showAvailabilityError} isGuest onRequireLogin={requestLogin} />}
          />
          <Route path="/my-bookings" element={<LoginPromptPage returnTo={currentReturnTo} />} />
          <Route path="/profile" element={<LoginPromptPage returnTo={currentReturnTo} />} />
          <Route path="/admin" element={<LoginPromptPage returnTo={currentReturnTo} />} />
          <Route path="/login-required" element={<LoginPromptPage returnTo={location.state?.returnTo} />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
        <Footer />
      </div>
    );
  }

  return (
    <div className="app-shell">
      <Header profile={session.user} onSignOut={handleLogout} />
      <Routes>
        <Route path="/" element={catalogueUnavailable ? catalogueStatus : <HomePage {...homeProps} />} />
        <Route path="/movies" element={catalogueUnavailable ? catalogueStatus : <MovieCataloguePage movies={catalogue.movies} categories={catalogue.categories} discoveryLoading={discoveryLoading} discoveryError={discoveryError} discoveryWarnings={movieDiscovery?.warnings || []} bookableMovieIds={bookableMovieIds} />} />
        <Route path="/movies/:movieId" element={catalogueUnavailable ? catalogueStatus : <MovieDetailsPage movies={catalogue.movies} localMovies={movies} bookableMovieIds={bookableMovieIds} showAvailabilityError={showAvailabilityError} />} />
        <Route path="/book/:movieId" element={catalogueUnavailable ? catalogueStatus : <BookingPage movies={movies} catalogueMovies={catalogue.movies} bookableMovieIds={bookableMovieIds} showAvailabilityError={showAvailabilityError} profile={session.user} token={session.token} />} />
        <Route path="/my-bookings" element={<BookingsPage movies={movies} profile={session.user} />} />
        <Route path="/profile" element={<ProfilePage profile={session.user} token={session.token} onProfileChange={handleProfileChange} />} />
        <Route
          path="/sign-in"
          element={<Navigate to={getSafeReturnTo(
            location.state?.returnTo || new URLSearchParams(location.search).get("returnTo"),
          )} replace />}
        />
        <Route
          path="/register"
          element={<Navigate to={getSafeReturnTo(
            location.state?.returnTo || new URLSearchParams(location.search).get("returnTo"),
          )} replace />}
        />
        <Route path="/forgot-password" element={<Navigate to="/" replace />} />
        <Route path="/reset-password" element={<Navigate to="/" replace />} />
        <Route
          path="/admin"
          element={session.user.role === "admin"
            ? <AdminPage movies={movies} onMoviesChange={setMovies} />
            : <Navigate to="/" replace />}
        />
        <Route path="*" element={<NotFound />} />
      </Routes>
      <Footer />
    </div>
  );
}

export default function App() {
  return <BrowserRouter><AppContent /></BrowserRouter>;
}
