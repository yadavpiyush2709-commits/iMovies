import React, { useEffect, useMemo, useState } from "react";
import {
  BrowserRouter,
  Link,
  NavLink,
  Route,
  Routes,
  useNavigate,
  useParams,
} from "react-router-dom";
import {
  cancelBooking,
  deleteBooking,
  getBookings,
  getMovies,
  getProfile,
  getShowtimes,
  getTheatres,
  saveBooking,
  saveMovies,
  saveProfile,
  saveShowtimes,
  saveTheatres,
  updateBookingStatus as setStoredBookingStatus,
} from "./services/demoStore";

const genres = ["All genres", "Action", "Adventure", "Drama", "Sci-Fi", "Thriller"];
const seatRows = ["A", "B", "C", "D", "E", "F", "G"];
const seatColumns = 10;

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
  };

  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  );
}

function Header({ profile, setProfile }) {
  const [menuOpen, setMenuOpen] = useState(false);

  function signOut() {
    saveProfile(null);
    setProfile(null);
    setMenuOpen(false);
  }

  return (
    <header className="site-header">
      <Link className="brand" to="/" aria-label="iMovies home">
        <span className="brand-mark"><Icon name="play" size={14} /></span>
        <span>iMovies<span className="brand-period">.</span></span>
      </Link>
      <button className="mobile-menu-button" type="button" aria-label="Toggle navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>
        <Icon name="menu" />
      </button>
      <nav className={`main-nav ${menuOpen ? "is-open" : ""}`} aria-label="Main navigation">
        <NavLink to="/" end onClick={() => setMenuOpen(false)}>Movies</NavLink>
        <a href="/#theatres" onClick={() => setMenuOpen(false)}>Theatres</a>
        <NavLink to="/my-bookings" onClick={() => setMenuOpen(false)}>My Bookings</NavLink>
        <a href="/#offers" onClick={() => setMenuOpen(false)}>Offers</a>
        <NavLink className="admin-nav-link" to="/admin" onClick={() => setMenuOpen(false)}>Manage</NavLink>
      </nav>
      <div className="header-account">
        {profile ? (
          <>
            <span className="account-name">{profile.name}</span>
            <button type="button" className="icon-button" aria-label="Sign out" onClick={signOut}><Icon name="logout" size={17} /></button>
          </>
        ) : (
          <Link className="sign-in-button" to="/sign-in">Sign in <Icon name="arrow" size={14} /></Link>
        )}
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="site-footer">
      <Link className="brand footer-brand" to="/"><span className="brand-mark"><Icon name="play" size={13} /></span><span>iMovies<span className="brand-period">.</span></span></Link>
      <span className="footer-copy">The best stories deserve the biggest screen. © {new Date().getFullYear()} iMovies</span>
      <div className="footer-links"><Link to="/">Movies</Link><Link to="/my-bookings">My bookings</Link><Link to="/admin">Manage</Link></div>
    </footer>
  );
}

function MovieCard({ movie, rank }) {
  return (
    <article className="movie-card">
      <Link className="poster-link" to={`/movies/${movie.id}`} aria-label={`View ${movie.title} details`}>
        <div className="movie-poster" style={{ backgroundImage: `linear-gradient(180deg, #090a0d05 24%, #090a0dce 100%), url("${movie.image}")` }}>
          {rank && <span className="trending-rank">{rank}</span>}
          {movie.label && <span className="poster-badge">{movie.label}</span>}
          <span className="poster-play"><Icon name="play" size={16} /></span>
          <div className="poster-copy"><span>{movie.genre} <i>·</i> {movie.duration}</span><h3>{movie.title}</h3></div>
        </div>
      </Link>
      <div className="movie-meta">
        <span className="movie-rating"><Icon name="star" size={14} /> {movie.rating === "Coming Soon" ? "Coming soon" : movie.rating}</span>
        <span>{movie.language}</span>
      </div>
      <Link className="card-cta" to={movie.release === "Coming Soon" ? `/movies/${movie.id}` : `/book/${movie.id}`}>
        {movie.release === "Coming Soon" ? "View details" : "Get tickets"} <Icon name="arrow" size={14} />
      </Link>
    </article>
  );
}

function MovieRail({ title, movies, rank = false, action }) {
  if (!movies.length) return null;
  return (
    <section className="movie-rail">
      <div className="rail-heading">
        <div><span className="section-kicker">THE LINEUP</span><h2>{title}</h2></div>
        {action && <button className="rail-action" type="button" onClick={action}>See all <Icon name="arrow" size={15} /></button>}
      </div>
      <div className="movie-grid">
        {movies.map((movie, index) => <MovieCard key={movie.id} movie={movie} rank={rank ? `0${index + 1}` : null} />)}
      </div>
    </section>
  );
}

function HomePage({ movies }) {
  const [search, setSearch] = useState("");
  const [genre, setGenre] = useState("All genres");
  const [category, setCategory] = useState("Trending");
  const trending = movies.filter((movie) => movie.release === "Now Showing").slice(0, 4);
  const nowShowing = movies.filter((movie) => movie.release === "Now Showing");
  const comingSoon = movies.filter((movie) => movie.release === "Coming Soon");
  const filtered = useMemo(() => movies.filter((movie) => {
    const matchesText = `${movie.title} ${movie.genre} ${movie.language}`.toLowerCase().includes(search.trim().toLowerCase());
    const matchesGenre = genre === "All genres" || movie.genre === genre;
    const matchesTrending = category !== "Trending" ||
      movies.filter((item) => item.release === "Now Showing").slice(0, 4).includes(movie);
    return matchesText && matchesGenre &&
      movie.release === (category === "Coming Soon" ? "Coming Soon" : "Now Showing") &&
      matchesTrending;
  }), [movies, search, genre, category]);

  return (
    <>
      <section className="hero">
        <div className="hero-art" />
        <div className="hero-content">
          <div className="eyebrow"><span /> THE CINEMA, REIMAGINED</div>
          <div className="hero-feature-label"><span>FEATURED PREMIERE</span><span className="hero-divider" /><span>IMAX EXPERIENCE</span></div>
          <h1>Some stories<br />are <em>larger</em> than life.</h1>
          <p>Escape into the extraordinary. Discover the films everyone will be talking about.</p>
          <div className="hero-actions">
            <Link className="button button-primary" to="/movies/dune-part-two">Explore the film <Icon name="arrow" size={16} /></Link>
            <Link className="button button-ghost" to="/book/dune-part-two"><Icon name="ticket" size={17} /> Book tickets</Link>
          </div>
          <div className="hero-film-note"><Icon name="star" size={14} /><strong>8.9</strong><span>Critically acclaimed</span><i>·</i><span>2h 46m</span></div>
        </div>
        <div className="hero-index"><span className="hero-index-active">01</span> <span>/</span> 04 <span className="hero-index-line" /></div>
        <div className="hero-vertical-label">A NIGHT AT THE MOVIES — REDEFINED</div>
      </section>

      <main className="page-content">
        <div className="discovery-toolbar">
          <div><span className="section-kicker">HANDPICKED FOR YOU</span><h2>Find your next <em>favorite.</em></h2></div>
          <div className="filter-controls">
            <label className="search-field"><Icon name="search" size={17} /><input type="search" placeholder="Search movies..." value={search} onChange={(event) => setSearch(event.target.value)} /><span>⌘ K</span></label>
            <label className="genre-select-label"><span className="sr-only">Filter by genre</span><select value={genre} onChange={(event) => setGenre(event.target.value)}>{genres.map((item) => <option key={item}>{item}</option>)}</select><Icon name="chevron" size={14} /></label>
          </div>
        </div>
        <div className="category-tabs" aria-label="Movie categories">
          <button type="button" className={category === "Trending" ? "category-tab active" : "category-tab"} onClick={() => setCategory("Trending")}>Trending <span>{trending.length}</span></button>
          <button type="button" className={category === "Now Showing" ? "category-tab active" : "category-tab"} onClick={() => setCategory("Now Showing")}>Now Showing <span>{nowShowing.length}</span></button>
          <button type="button" className={category === "Coming Soon" ? "category-tab active" : "category-tab"} onClick={() => setCategory("Coming Soon")}>Coming Soon <span>{comingSoon.length}</span></button>
        </div>

        {search || genre !== "All genres" ? (
          <section className="movie-rail filtered-rail">
            <div className="rail-heading"><div><span className="section-kicker">SEARCH RESULTS · {category.toUpperCase()}</span><h2>{filtered.length} {filtered.length === 1 ? "film" : "films"} for you</h2></div></div>
            {filtered.length ? <div className="movie-grid">{filtered.map((movie) => <MovieCard key={movie.id} movie={movie} />)}</div> : <div className="empty-panel"><Icon name="search" size={24} /><h3>No matching movies</h3><p>Try a different title or choose another genre.</p><button className="button button-subtle" type="button" onClick={() => { setSearch(""); setGenre("All genres"); }}>Clear filters</button></div>}
          </section>
        ) : category === "Coming Soon" ? (
          <MovieRail title="Coming soon" movies={comingSoon} />
        ) : category === "Now Showing" ? (
          <MovieRail title="Now showing" movies={nowShowing} />
        ) : (
          <MovieRail title="Trending now" movies={trending} rank />
        )}

        <section className="cinema-banner" id="theatres">
          <div className="cinema-banner-art" />
          <div className="cinema-banner-copy"><span className="section-kicker">YOUR SEAT. YOUR SOUNDTRACK.</span><h2>Turn a night out<br />into an <em>occasion.</em></h2><p>From immersive IMAX to the quiet luxury of our private screening rooms.</p><Link className="button button-light" to="/book/dune-part-two">Explore the experience <Icon name="arrow" size={15} /></Link></div>
          <div className="cinema-stamp"><Icon name="film" size={20} /><span>THE BIG<br />SCREEN FEELING</span></div>
        </section>
        <section className="offers-strip" id="offers"><span className="offers-icon"><Icon name="ticket" size={19} /></span><div><span className="section-kicker">A LITTLE EXTRA MAGIC</span><h3>Your next movie night comes with perks.</h3></div><Link to="/sign-in">Join iMovies <Icon name="arrow" size={15} /></Link></section>
      </main>
    </>
  );
}

function MovieDetailsPage({ movies }) {
  const { movieId } = useParams();
  const movie = movies.find((item) => item.id === movieId);
  if (!movie) return <NotFound />;
  return (
    <main className="details-page">
      <div className="details-backdrop" style={{ backgroundImage: `linear-gradient(90deg, #08090d 0%, #08090de0 48%, #08090d66 100%), url("${movie.image}")` }} />
      <div className="details-content">
        <Link className="back-link" to="/"><span>←</span> All movies</Link>
        <div className="detail-layout">
          <div className="detail-poster" style={{ backgroundImage: `url("${movie.image}")` }} />
          <div className="detail-copy">
            <div className="eyebrow"><span /> {movie.release === "Coming Soon" ? "COMING SOON" : "NOW SHOWING"} · {movie.year}</div>
            <h1>{movie.title}</h1>
            <div className="detail-pills"><span>{movie.genre}</span><span>{movie.duration}</span><span>{movie.language}</span>{movie.label && <span>{movie.label}</span>}</div>
            <div className="detail-rating"><Icon name="star" size={18} /><strong>{movie.rating}</strong><span>Audience rating</span></div>
            <p className="detail-synopsis">{movie.synopsis}</p>
            <div className="detail-actions">
              {movie.release === "Coming Soon" ? <Link className="button button-primary" to="/">Browse now showing films <Icon name="arrow" size={16} /></Link> : <Link className="button button-primary" to={`/book/${movie.id}`}>Choose a showtime <Icon name="arrow" size={16} /></Link>}
              <Link className="button button-ghost" to="/my-bookings"><Icon name="ticket" size={16} /> My bookings</Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function BookingPage({ movies, profile }) {
  const { movieId } = useParams();
  const navigate = useNavigate();
  const movie = movies.find((item) => item.id === movieId);
  const theatres = getTheatres();
  const showtimes = getShowtimes();
  const [theatreId, setTheatreId] = useState(theatres[0]?.id || "");
  const [showtime, setShowtime] = useState("");
  const [selectedSeats, setSelectedSeats] = useState([]);
  const [guestName, setGuestName] = useState(profile?.name || "");
  const [guestEmail, setGuestEmail] = useState(profile?.email || "");
  const [error, setError] = useState("");

  const selectedTheatre = theatres.find((theatre) => theatre.id === theatreId);
  const showDate = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" }).format(new Date());
  const occupiedSeats = useMemo(() => {
    const bookings = getBookings();
    return bookings
      .filter((booking) => booking.movieId === movieId && booking.theatreId === theatreId && booking.showtime === showtime && booking.showDate === showDate && booking.status !== "Cancelled")
      .flatMap((booking) => booking.seats);
  }, [movieId, theatreId, showtime, showDate]);

  if (!movie) return <NotFound />;
  if (movie.release === "Coming Soon") return <MovieDetailsPage movies={movies} />;

  function submitBooking(event) {
    event.preventDefault();
    setError("");
    if (!selectedTheatre || !showtime || !selectedSeats.length) {
      setError("Choose a cinema, showtime, and at least one seat to continue.");
      return;
    }

    const conflict = getBookings().some((booking) =>
      booking.movieId === movieId &&
      booking.theatreId === theatreId &&
      booking.showtime === showtime &&
      booking.showDate === showDate &&
      booking.status !== "Cancelled" &&
      booking.seats.some((seat) => selectedSeats.includes(seat)),
    );
    if (conflict) {
      setError("One of those seats was just booked. Please choose another seat.");
      setSelectedSeats([]);
      return;
    }

    const booking = {
      id: `IM-${Date.now().toString(36).toUpperCase()}`,
      movieId,
      movieTitle: movie.title,
      movieImage: movie.image,
      theatreId,
      theatreName: selectedTheatre.name,
      theatreLocation: selectedTheatre.location,
      showtime,
      showDate,
      seats: selectedSeats,
      total: selectedSeats.length * 14,
      name: guestName.trim(),
      email: guestEmail.trim(),
      status: "Confirmed",
      createdAt: new Date().toISOString(),
    };

    try {
      saveBooking(booking);
      navigate("/my-bookings", { state: { confirmation: booking.id } });
    } catch (saveError) {
      setError(saveError.message);
    }
  }

  function toggleSeat(seat) {
    if (occupiedSeats.includes(seat)) return;
    setSelectedSeats((current) => current.includes(seat) ? current.filter((item) => item !== seat) : [...current, seat]);
  }

  return (
    <main className="booking-page">
      <div className="page-eyebrow"><span className="section-kicker">YOUR EVENING STARTS HERE</span><h1>Make it a <em>movie night.</em></h1><p>Choose your cinema, find your seats, and we’ll save the story.</p></div>
      <form className="booking-layout" onSubmit={submitBooking}>
        <div className="booking-main">
          <section className="booking-step">
            <StepHeading number="01" title="Choose your cinema" helper="Find your perfect screen." />
            <div className="theatre-options">
              {theatres.map((theatre) => <button className={`theatre-option ${theatreId === theatre.id ? "selected" : ""}`} type="button" key={theatre.id} onClick={() => { setTheatreId(theatre.id); setSelectedSeats([]); }}><span className="theatre-icon"><Icon name="film" size={19} /></span><span className="theatre-copy"><strong>{theatre.name}</strong><small>{theatre.location} · {theatre.formats}</small></span><i className="selection-dot" /></button>)}
              {!theatres.length && <div className="empty-inline">No theatres are available yet. Ask an administrator to add one.</div>}
            </div>
          </section>
          <section className="booking-step">
            <StepHeading number="02" title="Pick a showtime" helper={`${showDate} · Local time`} />
            <div className="showtime-options">
              {showtimes.map((time) => <button className={`showtime-option ${showtime === time ? "selected" : ""}`} type="button" key={time} onClick={() => { setShowtime(time); setSelectedSeats([]); }}><Icon name="clock" size={15} />{time}</button>)}
              {!showtimes.length && <div className="empty-inline">No showtimes are listed. Ask an administrator to add showtimes.</div>}
            </div>
          </section>
          {showtime && (
            <section className="booking-step seat-selection-step">
              <StepHeading number="03" title="Pick your seats" helper="The best seats go first." />
              <div className="seat-map">
                <div className="screen-curve"><span>SCREEN</span></div>
                <div className="seat-chart">
                  {seatRows.map((row) => <div className="seat-row" key={row}><span className="row-label">{row}</span>{Array.from({ length: seatColumns }, (_, index) => {
                    const seat = `${row}${index + 1}`;
                    const occupied = occupiedSeats.includes(seat);
                    return <button key={seat} type="button" disabled={occupied} aria-label={`${seat}${occupied ? ", occupied" : selectedSeats.includes(seat) ? ", selected" : ", available"}`} aria-pressed={selectedSeats.includes(seat)} className={`seat ${occupied ? "occupied" : ""} ${selectedSeats.includes(seat) ? "chosen" : ""}`} onClick={() => toggleSeat(seat)} />;
                  })}<span className="row-label">{row}</span></div>)}
                </div>
                <div className="seat-legend"><span><i /> Available</span><span><i className="legend-selected" /> Selected</span><span><i className="legend-occupied" /> Occupied</span></div>
              </div>
            </section>
          )}
          <section className="booking-step">
            <StepHeading number={showtime ? "04" : "03"} title="Where should we send your tickets?" helper="Your e-ticket will arrive by email." />
            <div className="guest-fields"><label>Your name<input value={guestName} onChange={(event) => setGuestName(event.target.value)} required placeholder="Alex Morgan" autoComplete="name" /></label><label>Email address<input value={guestEmail} onChange={(event) => setGuestEmail(event.target.value)} required type="email" placeholder="alex@example.com" autoComplete="email" /></label></div>
          </section>
        </div>
        <aside className="booking-summary">
          <span className="section-kicker">YOUR EVENING</span>
          <h2>Booking summary</h2>
          <div className="summary-movie"><div className="summary-poster" style={{ backgroundImage: `url("${movie.image}")` }} /><div><strong>{movie.title}</strong><span>{movie.genre} · {movie.duration}</span></div></div>
          <div className="summary-detail"><span><Icon name="film" size={15} /> Cinema</span><strong>{selectedTheatre?.name || "Choose a cinema"}</strong>{selectedTheatre && <small>{selectedTheatre.location}</small>}</div>
          <div className="summary-detail"><span><Icon name="calendar" size={15} /> Date & time</span><strong>{showtime ? `${showDate} · ${showtime}` : "Choose a showtime"}</strong></div>
          <div className="summary-detail"><span><Icon name="ticket" size={15} /> Seats</span><strong>{selectedSeats.length ? selectedSeats.join(", ") : "Choose your seats"}</strong></div>
          <div className="summary-total"><span>{selectedSeats.length} {selectedSeats.length === 1 ? "ticket" : "tickets"}</span><strong>${(selectedSeats.length * 14).toFixed(2)}</strong></div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button button-primary summary-submit" type="submit" disabled={!selectedSeats.length}>Confirm booking <Icon name="arrow" size={16} /></button>
          <p className="summary-note">Demo checkout · Your booking is saved in this browser.</p>
        </aside>
      </form>
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
          return <article className={`booking-ticket ${booking.status === "Cancelled" ? "cancelled" : ""}`} key={booking.id}><div className="ticket-art" style={{ backgroundImage: `url("${booking.movieImage}")` }} /><div className="ticket-info"><span className={`status-pill ${booking.status.toLowerCase()}`}>{booking.status}</span><h2>{booking.movieTitle}</h2><p><Icon name="calendar" size={14} /> {booking.showDate} · {booking.showtime}</p><p><Icon name="pin" size={14} /> {booking.theatreName} · {booking.theatreLocation}</p><p><Icon name="ticket" size={14} /> Seats {booking.seats.join(", ")} · ${booking.total.toFixed(2)}</p><span className="booking-reference">BOOKING REF · {booking.id}</span></div><div className="ticket-actions">{movie && <Link className="text-button" to={`/movies/${movie.id}`}>Movie details <Icon name="arrow" size={14} /></Link>}{booking.status !== "Cancelled" && <button className="text-button cancel-action" type="button" onClick={() => handleCancel(booking.id)}>Cancel booking <Icon name="close" size={14} /></button>}</div></article>;
        })}</div>
      )}
    </main>
  );
}

function AuthPage({ onLogin }) {
  const navigate = useNavigate();
  const [mode, setMode] = useState("sign-in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");

  function submit(event) {
    event.preventDefault();
    setError("");
    if (mode === "register" && name.trim().length < 2) {
      setError("Please enter a name with at least two characters.");
      return;
    }
    const profile = { name: name.trim() || email.split("@")[0], email: email.trim().toLowerCase() };
    try {
      saveProfile(profile);
      onLogin(profile);
      navigate("/my-bookings");
    } catch (saveError) {
      setError(saveError.message);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-art"><span className="section-kicker">WELCOME TO YOUR HAPPY PLACE</span><h1>Let the<br /><em>good stories</em><br />find you.</h1><p>Your next great night out is just a few clicks away.</p></div>
      <form className="auth-card" onSubmit={submit}>
        <span className="section-kicker">YOUR iMOVIES ACCOUNT</span><h2>{mode === "sign-in" ? "Welcome back." : "Join the audience."}</h2><p>Keep your tickets, bookings, and favorite films together.</p>
        {mode === "register" && <label>Your name<input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" placeholder="Alex Morgan" required /></label>}
        <label>Email address<input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" placeholder="you@example.com" required /></label>
        <p className="demo-caption">Demo profile only — account details stay in this browser. No password or payment is collected.</p>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="button button-primary auth-submit" type="submit">{mode === "sign-in" ? "Continue with email" : "Create your profile"} <Icon name="arrow" size={16} /></button>
        <p className="auth-switch">{mode === "sign-in" ? "New to iMovies?" : "Already have a profile?"} <button type="button" onClick={() => { setMode(mode === "sign-in" ? "register" : "sign-in"); setError(""); }}>{mode === "sign-in" ? "Create an account" : "Sign in"}</button></p>
      </form>
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

function AppContent() {
  const [movies, setMovies] = useState(getMovies);
  const [profile, setProfile] = useState(getProfile);

  useEffect(() => {
    document.title = "iMovies — Your next great night out";
  }, []);

  return (
    <div className="app-shell">
      <Header profile={profile} setProfile={setProfile} />
      <Routes>
        <Route path="/" element={<HomePage movies={movies} />} />
        <Route path="/movies/:movieId" element={<MovieDetailsPage movies={movies} />} />
        <Route path="/book/:movieId" element={<BookingPage movies={movies} profile={profile} />} />
        <Route path="/my-bookings" element={<BookingsPage movies={movies} profile={profile} />} />
        <Route path="/sign-in" element={<AuthPage onLogin={setProfile} />} />
        <Route path="/admin" element={<AdminPage movies={movies} onMoviesChange={setMovies} />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      <Footer />
    </div>
  );
}

export default function App() {
  return <BrowserRouter><AppContent /></BrowserRouter>;
}
