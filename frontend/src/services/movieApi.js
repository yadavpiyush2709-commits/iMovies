const API_BASE_URL = (
  import.meta.env.VITE_API_URL || "http://localhost:5000/api"
).replace(/\/+$/, "");
const MOVIES_API_URL = `${API_BASE_URL}/movies`;
const TMDB_DISCOVERY_URL = `${MOVIES_API_URL}/discovery`;

async function readMovieServiceResponse(requestUrl, serviceName) {
  let response;
  try {
    response = await fetch(requestUrl);
  } catch {
    throw new Error(
      `Unable to connect to the ${serviceName}. Check that the backend is running and try again.`,
    );
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(`The ${serviceName} returned an invalid response.`);
  }

  if (!response.ok) {
    const error = new Error(
      data?.message || `The ${serviceName} returned HTTP ${response.status}.`,
    );
    error.code = data?.code || "MOVIE_SERVICE_ERROR";
    error.status = response.status;
    throw error;
  }

  return data;
}

export async function fetchMovies() {
  let response;

  try {
    response = await fetch(MOVIES_API_URL);
  } catch {
    throw new Error(
      "Unable to connect to the movie service. Check that the backend is running and try again.",
    );
  }

  if (!response.ok) {
    throw new Error(
      `Failed to load movies: the server returned HTTP ${response.status}.`,
    );
  }

  let data;

  try {
    data = await response.json();
  } catch {
    throw new Error("The movie service returned an invalid response.");
  }

  if (!data || !Array.isArray(data.movies)) {
    throw new Error("The movie service returned an invalid movies list.");
  }

  return data.movies;
}

export async function fetchMovieDiscovery() {
  const data = await readMovieServiceResponse(TMDB_DISCOVERY_URL, "TMDB discovery service");
  if (
    data?.success !== true ||
    data?.provider !== "tmdb" ||
    !Array.isArray(data.movies) ||
    data.movies.length < 100 ||
    !data.categories ||
    typeof data.categories !== "object"
  ) {
    throw new Error("The TMDB discovery service returned an incomplete catalogue.");
  }
  return data;
}

export async function fetchTmdbMovieDetails(tmdbId) {
  const data = await readMovieServiceResponse(
    `${MOVIES_API_URL}/tmdb/${encodeURIComponent(tmdbId)}`,
    "TMDB movie detail service",
  );
  if (data?.success !== true || data?.provider !== "tmdb" || !data.movie) {
    throw new Error("The TMDB movie detail service returned an invalid movie.");
  }
  return data.movie;
}
