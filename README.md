# IMovies - Cinema Booking System

Full-stack MERN cinema booking application for browsing movies, choosing shows and seats, making bookings, and managing theatre operations.

## Frontend Experience

The React/Vite frontend includes a responsive dark cinema storefront, trending/now-showing/coming-soon categories, movie search and genre filters, movie detail pages, a theatre/showtime/seat booking flow, booking history, a local profile flow, and a management dashboard.

The current frontend catalogue and demo account, theatre, showtime, and booking data are stored in the browser's local storage. The booking flow is a demo checkout: it does not charge a payment method or reserve seats in MongoDB. The management dashboard is not protected by server-side admin authorization and must not be used to manage live cinema data.

Start the frontend from the `frontend` folder with `npm run dev`. Routes include `/`, `/movies/:movieId`, `/book/:movieId`, `/my-bookings`, `/sign-in`, and `/admin`.

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
