const https = require("https");

const API_BASE_URL = "https://api.themoviedb.org/3";
const CACHE_DURATION_MS = 15 * 60 * 1000;
const DETAILS_CACHE_DURATION_MS = 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10000;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const MIN_CATALOGUE_SIZE = 100;
const MAX_DISCOVER_PAGES = 10;
const MIN_RATING_VOTES = 25;

let discoveryCache;
let discoveryRequest;
let imageConfigurationCache;
let genreCache;
const detailsCache = new Map();
const detailsRequests = new Map();

function serviceError(message, code, statusCode, retryAfter) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  if (retryAfter) error.retryAfter = retryAfter;
  return error;
}

function getAccessToken() {
  const token = process.env.TMDB_ACCESS_TOKEN?.trim();
  if (!token) {
    throw serviceError(
      "TMDB movie discovery is not configured. Add TMDB_ACCESS_TOKEN to the backend environment.",
      "TMDB_NOT_CONFIGURED",
      503,
    );
  }
  return token;
}

function requestTmdb(path, parameters = {}) {
  const token = getAccessToken();
  const url = new URL(`${API_BASE_URL}/${path.replace(/^\/+/, "")}`);
  Object.entries(parameters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });

  return new Promise((resolve, reject) => {
    let settled = false;
    let responseBytes = 0;
    const chunks = [];
    const settleError = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    const request = https.request(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
    }, (response) => {
      response.on("data", (chunk) => {
        responseBytes += chunk.length;
        if (responseBytes > MAX_RESPONSE_BYTES) {
          response.destroy();
          settleError(serviceError(
            "TMDB returned a response that was too large.",
            "TMDB_RESPONSE_TOO_LARGE",
            502,
          ));
          return;
        }
        chunks.push(chunk);
      });

      response.on("end", () => {
        if (settled) return;
        const statusCode = response.statusCode || 502;
        if (statusCode < 200 || statusCode >= 300) {
          const retryAfter = response.headers["retry-after"];
          if (statusCode === 429) {
            settleError(serviceError(
              "TMDB is temporarily rate-limiting requests. Please try again shortly.",
              "TMDB_RATE_LIMITED",
              503,
              retryAfter,
            ));
            return;
          }
          if (statusCode === 401 || statusCode === 403) {
            settleError(serviceError(
              "TMDB authentication failed. Verify the backend TMDB_ACCESS_TOKEN.",
              "TMDB_AUTH_FAILED",
              502,
            ));
            return;
          }
          settleError(serviceError(
            "TMDB could not complete the movie request.",
            "TMDB_UPSTREAM_ERROR",
            502,
          ));
          return;
        }

        try {
          const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          settled = true;
          resolve(data);
        } catch {
          settleError(serviceError(
            "TMDB returned invalid JSON.",
            "TMDB_INVALID_RESPONSE",
            502,
          ));
        }
      });

      response.on("error", () => {
        settleError(serviceError(
          "Unable to read the TMDB response.",
          "TMDB_RESPONSE_ERROR",
          502,
        ));
      });
    });

    request.setTimeout(REQUEST_TIMEOUT_MS, () => {
      request.destroy();
      settleError(serviceError(
        "TMDB did not respond before the request timed out.",
        "TMDB_TIMEOUT",
        504,
      ));
    });
    request.on("error", () => {
      settleError(serviceError(
        "Unable to connect to TMDB.",
        "TMDB_CONNECTION_ERROR",
        502,
      ));
    });
    request.end();
  });
}

function getImageUrl(path, size, secureBaseUrl) {
  if (typeof path !== "string" || !path.startsWith("/") || !secureBaseUrl) {
    return "";
  }
  return `${secureBaseUrl}${size}${path}`;
}

function chooseImageSize(availableSizes, preferredSize) {
  return availableSizes.includes(preferredSize) ? preferredSize : "original";
}

async function getImageConfiguration() {
  if (imageConfigurationCache && imageConfigurationCache.expiresAt > Date.now()) {
    return imageConfigurationCache.value;
  }

  const data = await requestTmdb("configuration");
  const images = data?.images;
  if (
    typeof images?.secure_base_url !== "string" ||
    !Array.isArray(images.poster_sizes) ||
    !Array.isArray(images.backdrop_sizes)
  ) {
    throw serviceError(
      "TMDB image configuration is incomplete.",
      "TMDB_INVALID_CONFIGURATION",
      502,
    );
  }

  const configuration = {
    secureBaseUrl: images.secure_base_url,
    posterSize: chooseImageSize(images.poster_sizes, "w500"),
    backdropSize: chooseImageSize(images.backdrop_sizes, "w1280"),
  };
  imageConfigurationCache = {
    value: configuration,
    expiresAt: Date.now() + 24 * 60 * 60 * 1000,
  };
  return configuration;
}

async function getGenreNames() {
  if (genreCache && genreCache.expiresAt > Date.now()) {
    return genreCache.value;
  }

  const data = await requestTmdb("genre/movie/list", { language: "en" });
  if (!Array.isArray(data?.genres)) {
    throw serviceError(
      "TMDB returned an invalid movie genre list.",
      "TMDB_INVALID_GENRES",
      502,
    );
  }

  const names = new Map(data.genres.map((genre) => [genre.id, genre.name]));
  genreCache = {
    value: names,
    expiresAt: Date.now() + 24 * 60 * 60 * 1000,
  };
  return names;
}

function deduplicateMovies(movies) {
  const unique = new Map();
  for (const movie of movies) {
    if (Number.isSafeInteger(movie?.id) && movie.id > 0 && !unique.has(movie.id)) {
      unique.set(movie.id, movie);
    }
  }
  return [...unique.values()];
}

function languageName(code) {
  if (typeof code !== "string" || !code) return "";
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(code) || code;
  } catch {
    return code;
  }
}

function normalizeMovie(movie, genreNames, imageConfiguration) {
  const voteCount = Number.isSafeInteger(movie.vote_count) && movie.vote_count >= 0
    ? movie.vote_count
    : 0;
  const voteAverage = Number.isFinite(movie.vote_average) ? movie.vote_average : 0;
  const rating = voteCount >= MIN_RATING_VOTES && voteAverage > 0 && voteAverage <= 10
    ? voteAverage
    : null;

  return {
    tmdbId: String(movie.id),
    title: typeof movie.title === "string" ? movie.title : "",
    overview: typeof movie.overview === "string" ? movie.overview : "",
    poster: getImageUrl(movie.poster_path, imageConfiguration.posterSize, imageConfiguration.secureBaseUrl),
    backdrop: getImageUrl(movie.backdrop_path, imageConfiguration.backdropSize, imageConfiguration.secureBaseUrl),
    releaseDate: /^\d{4}-\d{2}-\d{2}$/.test(movie.release_date || "") ? movie.release_date : "",
    genres: Array.isArray(movie.genre_ids)
      ? movie.genre_ids.map((id) => genreNames.get(id)).filter(Boolean)
      : [],
    originalLanguage: typeof movie.original_language === "string" ? movie.original_language : "",
    language: languageName(movie.original_language),
    rating,
    voteCount,
  };
}

function resultMovies(response) {
  if (!Array.isArray(response?.results)) {
    throw serviceError(
      "TMDB returned an invalid movie list.",
      "TMDB_INVALID_MOVIES",
      502,
    );
  }
  return response.results;
}

function idsFrom(response) {
  return resultMovies(response)
    .map((movie) => movie.id)
    .filter((id) => Number.isSafeInteger(id) && id > 0);
}

function combineIds(...lists) {
  return [...new Set(lists.flat().map((id) => String(id)))];
}

async function fetchCoreCataloguePages() {
  const pageResponses = await Promise.all(
    Array.from({ length: 5 }, (_, index) =>
      requestTmdb("discover/movie", {
        include_adult: false,
        language: "en-US",
        sort_by: "popularity.desc",
        page: index + 1,
      })),
  );
  let movies = deduplicateMovies(pageResponses.flatMap(resultMovies));

  for (let page = 6; movies.length < MIN_CATALOGUE_SIZE && page <= MAX_DISCOVER_PAGES; page += 1) {
    movies = deduplicateMovies([
      ...movies,
      ...resultMovies(await requestTmdb("discover/movie", {
        include_adult: false,
        language: "en-US",
        sort_by: "popularity.desc",
        page,
      })),
    ]);
  }

  if (movies.length < MIN_CATALOGUE_SIZE) {
    throw serviceError(
      "TMDB returned fewer than 100 distinct movies. The discovery catalogue is temporarily incomplete.",
      "TMDB_CATALOGUE_INCOMPLETE",
      502,
    );
  }

  return movies;
}

async function fetchOptionalCategories() {
  const endpoints = {
    trending: ["trending/movie/week", {}],
    popular: ["movie/popular", {}],
    topRated: ["movie/top_rated", {}],
    nowPlaying: ["movie/now_playing", {}],
    upcoming: ["movie/upcoming", {}],
    bollywood: ["discover/movie", {
      include_adult: false,
      sort_by: "popularity.desc",
      with_original_language: "hi",
    }],
    hollywood: ["discover/movie", {
      include_adult: false,
      sort_by: "popularity.desc",
      with_origin_country: "US",
      with_original_language: "en",
    }],
    indianCinema: ["discover/movie", {
      include_adult: false,
      sort_by: "popularity.desc",
      with_origin_country: "IN",
    }],
  };

  const warnings = [];
  const entries = await Promise.all(Object.entries(endpoints).map(async ([name, [path, parameters]]) => {
    try {
      return [name, await requestTmdb(path, parameters)];
    } catch {
      warnings.push(`${name} movie collection could not be loaded.`);
      return [name, { results: [] }];
    }
  }));
  return { categories: Object.fromEntries(entries), warnings };
}

async function buildDiscoveryCatalogue() {
  const [imageConfiguration, genreNames, coreMovies, optional] = await Promise.all([
    getImageConfiguration(),
    getGenreNames(),
    fetchCoreCataloguePages(),
    fetchOptionalCategories(),
  ]);
  const rawMovies = deduplicateMovies([
    ...coreMovies,
    ...Object.values(optional.categories).flatMap(resultMovies),
  ]);
  const normalizedMovies = rawMovies.map((movie) =>
    normalizeMovie(movie, genreNames, imageConfiguration));
  const allById = new Map(normalizedMovies.map((movie) => [movie.tmdbId, movie]));
  const categoryIds = Object.fromEntries(
    Object.entries(optional.categories).map(([name, result]) => [name, idsFrom(result)]),
  );
  const indianLanguages = new Set(["hi", "ta", "te", "ml", "kn", "bn", "mr", "pa", "gu", "or"]);
  const today = new Date();
  const recentlyReleased = normalizedMovies
    .filter((movie) => {
      if (!movie.releaseDate) return false;
      const releaseTime = new Date(`${movie.releaseDate}T00:00:00Z`).getTime();
      const age = today.getTime() - releaseTime;
      return age >= 0 && age <= 180 * 24 * 60 * 60 * 1000;
    })
    .sort((left, right) => right.releaseDate.localeCompare(left.releaseDate))
    .map((movie) => movie.tmdbId);

  categoryIds.indianCinema = combineIds(
    categoryIds.indianCinema,
    normalizedMovies
      .filter((movie) => indianLanguages.has(movie.originalLanguage))
      .map((movie) => movie.tmdbId),
  );
  categoryIds.recentlyReleased = recentlyReleased;

  const missingCategoryIds = Object.values(categoryIds).flat()
    .filter((id) => !allById.has(String(id)));
  if (missingCategoryIds.length) {
    throw serviceError(
      "TMDB category results did not contain complete movie records.",
      "TMDB_INCOMPLETE_CATEGORIES",
      502,
    );
  }

  return {
    movies: normalizedMovies,
    categories: categoryIds,
    totalDistinctMovies: normalizedMovies.length,
    warnings: optional.warnings,
  };
}

async function getMovieDiscovery() {
  getAccessToken();
  if (discoveryCache && discoveryCache.expiresAt > Date.now()) {
    return discoveryCache.value;
  }
  if (discoveryRequest) return discoveryRequest;

  discoveryRequest = buildDiscoveryCatalogue()
    .then((catalogue) => {
      discoveryCache = {
        value: catalogue,
        expiresAt: Date.now() + CACHE_DURATION_MS,
      };
      return catalogue;
    })
    .finally(() => {
      discoveryRequest = null;
    });
  return discoveryRequest;
}

function normalizeMovieDetails(movie, genreNames, imageConfiguration) {
  const base = normalizeMovie({
    ...movie,
    genre_ids: Array.isArray(movie.genres) ? movie.genres.map((genre) => genre.id) : [],
  }, genreNames, imageConfiguration);
  const officialTrailers = (movie.videos?.results || [])
    .filter((video) =>
      video.site === "YouTube" &&
      video.type === "Trailer" &&
      video.official === true &&
      typeof video.key === "string" &&
      /^[\w-]{6,}$/.test(video.key))
    .map((video) => ({
      name: video.name,
      url: `https://www.youtube.com/watch?v=${encodeURIComponent(video.key)}`,
    }));
  const cast = (movie.credits?.cast || [])
    .filter((person) => typeof person.name === "string")
    .slice(0, 12)
    .map((person) => ({
      name: person.name,
      character: typeof person.character === "string" ? person.character : "",
    }));
  const director = (movie.credits?.crew || [])
    .find((person) => person.job === "Director" && typeof person.name === "string");

  return {
    ...base,
    runtimeMinutes: Number.isInteger(movie.runtime) && movie.runtime > 0 ? movie.runtime : null,
    cast,
    director: director?.name || "",
    trailers: officialTrailers,
  };
}

async function getMovieDetails(tmdbId) {
  getAccessToken();
  if (!/^\d{1,15}$/.test(tmdbId)) {
    throw serviceError("TMDB movie ID must be a positive numeric ID.", "INVALID_TMDB_ID", 400);
  }

  const cached = detailsCache.get(tmdbId);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (detailsRequests.has(tmdbId)) return detailsRequests.get(tmdbId);

  const detailRequest = Promise.all([
    requestTmdb(`movie/${tmdbId}`, {
      append_to_response: "credits,videos",
      language: "en-US",
    }),
    getGenreNames(),
    getImageConfiguration(),
  ])
    .then(([movie, genreNames, imageConfiguration]) => {
      const details = normalizeMovieDetails(movie, genreNames, imageConfiguration);
      if (detailsCache.size >= 200) {
        detailsCache.delete(detailsCache.keys().next().value);
      }
      detailsCache.set(tmdbId, {
        value: details,
        expiresAt: Date.now() + DETAILS_CACHE_DURATION_MS,
      });
      return details;
    })
    .finally(() => {
      detailsRequests.delete(tmdbId);
    });
  detailsRequests.set(tmdbId, detailRequest);
  return detailRequest;
}

module.exports = {
  getMovieDetails,
  getMovieDiscovery,
  normalizeMovie,
  normalizeMovieDetails,
  deduplicateMovies,
  getImageUrl,
};
