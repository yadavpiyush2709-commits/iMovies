# Tesseract Films - Cinema Booking System

Full-stack MERN cinema booking application for browsing movies, choosing shows and seats, making bookings, and managing theatre operations.

## Frontend Experience

The React/Vite frontend includes a responsive cinema storefront, TMDB-powered movie discovery, searchable movie categories, movie details, real theatre/showtime and seat-lock APIs, booking history, account pages, and a management dashboard. The TMDB catalogue is read-only and separate from MongoDB show inventory; imported discovery titles do not create or imply bookable shows.

Movie records served by MongoDB retain their existing IDs and show relationships. TMDB records use client-side `tmdb-<id>` identifiers unless a unique matching local movie exists; no TMDB discovery request writes movie or show records. Ticket actions are enabled only for actual show records returned by the theatre API. Online payment and booking confirmation remain disabled. The management dashboard must not be used to manage live cinema data unless its server-side authorization and data integrations have been verified.

Start the frontend from the `frontend` folder with `npm run dev`. Routes include `/`, `/movies`, `/movies/:movieId`, `/book/:movieId`, `/my-bookings`, `/sign-in`, and `/admin`.

## TMDB Movie Discovery

The backend fetches movie discovery data from TMDB and caches the combined catalogue in memory. It retrieves multiple Discover pages, de-duplicates TMDB IDs, and provides Trending, Popular, Top Rated, Now Playing, Upcoming, Bollywood, Hollywood, Indian Cinema, and Recently Released collections. TMDB discovery is not synchronized to MongoDB.

Set a TMDB API v4 Read Access Token in `backend/.env`:

```env
TMDB_ACCESS_TOKEN=your_tmdb_read_access_token
```

The token remains server-side. The frontend calls `GET /api/movies/discovery` and `GET /api/movies/tmdb/:tmdbId`; with no token, MongoDB-backed movie browsing remains available and TMDB discovery reports that setup is required. The catalogue endpoint returns at least 100 distinct TMDB movies or an explicit upstream/configuration error.

TMDB discovery and details are cached in backend memory. Discovery requests are rate limited, movie images use TMDB's configured secure image base and responsive sizes, and cards load poster images lazily. TMDB ratings are shown only for valid scores with at least 25 votes.

The website includes the required attribution: “This product uses the TMDB API but is not endorsed or certified by TMDB.” See [TMDB API documentation](https://developer.themoviedb.org/docs) and [image basics](https://developer.themoviedb.org/docs/image-basics).

## Project Structure

```text
teseractfilms/
|-- backend/
|   |-- src/
|   |   |-- config/
|   |   |-- constants/
|   |   |-- controllers/
|   |   |-- middlewares/
|   |   |-- models/
|   |   |-- routes/
|   |   |-- services/
|   |   |-- sockets/
|   |   |-- utils/
|   |   |-- validations/
|   |   |-- app.js
|   |   `-- server.js
|   |-- tests/
|   |   |-- integration/
|   |   `-- unit/
|   |-- uploads/movies/
|   |-- .env.example
|   `-- package.json
|-- frontend/
|   |-- public/
|   |-- src/
|   |   |-- assets/
|   |   |-- components/
|   |   |   |-- admin/
|   |   |   |-- booking/
|   |   |   |-- common/
|   |   |   |-- layout/
|   |   |   |-- movies/
|   |   |   `-- payment/
|   |   |-- hooks/
|   |   |-- pages/
|   |   |-- routes/
|   |   |-- services/
|   |   |-- store/slices/
|   |   `-- utils/
|   |-- tests/
|   |-- .env.example
|   |-- index.html
|   `-- package.json
|-- docs/
`-- scripts/
```

## Backend Setup

```powershell
cd backend
npm install
Copy-Item .env.example .env
npm run dev
```

## Frontend Setup

```powershell
cd frontend
npm install
Copy-Item .env.example .env
npm run dev
```
