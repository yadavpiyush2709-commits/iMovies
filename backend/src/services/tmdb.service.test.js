const https = require("https");
const { EventEmitter } = require("events");
const {
  deduplicateMovies,
  getMovieDiscovery,
  normalizeMovie,
  normalizeMovieDetails,
} = require("./tmdb.service");

describe("TMDB movie normalization", () => {
  test("uses configured TMDB image sizes and real genre names", () => {
    const movie = normalizeMovie({
      id: 101,
      title: "Example Film",
      poster_path: "/poster.jpg",
      backdrop_path: "/backdrop.jpg",
      release_date: "2025-03-14",
      genre_ids: [28, 999],
      original_language: "en",
      vote_average: 8.2,
      vote_count: 250,
    }, new Map([[28, "Action"]]), {
      secureBaseUrl: "https://image.tmdb.org/t/p/",
      posterSize: "w500",
      backdropSize: "w1280",
    });

    expect(movie).toMatchObject({
      tmdbId: "101",
      poster: "https://image.tmdb.org/t/p/w500/poster.jpg",
      backdrop: "https://image.tmdb.org/t/p/w1280/backdrop.jpg",
      genres: ["Action"],
      rating: 8.2,
      voteCount: 250,
    });
  });

  test("does not display ratings without enough real votes or valid scores", () => {
    const baseMovie = {
      id: 102,
      title: "Low Vote Film",
      vote_average: 9.1,
      vote_count: 24,
    };
    const imageConfiguration = {
      secureBaseUrl: "https://image.tmdb.org/t/p/",
      posterSize: "w500",
      backdropSize: "w1280",
    };

    expect(normalizeMovie(baseMovie, new Map(), imageConfiguration).rating).toBeNull();
    expect(normalizeMovie({
      ...baseMovie,
      vote_count: 25,
      vote_average: 10.1,
    }, new Map(), imageConfiguration).rating).toBeNull();
    expect(normalizeMovie({
      ...baseMovie,
      vote_count: 25,
    }, new Map(), imageConfiguration).rating).toBe(9.1);
  });

  test("deduplicates movie records by TMDB ID", () => {
    expect(deduplicateMovies([
      { id: 1, title: "First response" },
      { id: 1, title: "Duplicate response" },
      { id: 2, title: "Second movie" },
      { id: "3", title: "Invalid ID" },
    ])).toEqual([
      { id: 1, title: "First response" },
      { id: 2, title: "Second movie" },
    ]);
  });

  test("includes only official YouTube trailers and limits cast to the first twelve credits", () => {
    const details = normalizeMovieDetails({
      id: 300,
      title: "Movie with credits",
      genres: [{ id: 28, name: "Action" }],
      runtime: 123,
      vote_average: 7.8,
      vote_count: 150,
      videos: {
        results: [
          { site: "YouTube", type: "Trailer", official: true, key: "valid-key-123", name: "Official trailer" },
          { site: "YouTube", type: "Trailer", official: false, key: "unofficial-key", name: "Unofficial trailer" },
          { site: "Vimeo", type: "Trailer", official: true, key: "vimeo-key", name: "External trailer" },
          { site: "YouTube", type: "Teaser", official: true, key: "teaser-key", name: "Teaser" },
        ],
      },
      credits: {
        cast: Array.from({ length: 14 }, (_, index) => ({ name: `Actor ${index + 1}`, character: "Character" })),
        crew: [{ job: "Director", name: "Director Name" }],
      },
    }, new Map([[28, "Action"]]), {
      secureBaseUrl: "https://image.tmdb.org/t/p/",
      posterSize: "w500",
      backdropSize: "w1280",
    });

    expect(details).toMatchObject({
      runtimeMinutes: 123,
      director: "Director Name",
      rating: 7.8,
    });
    expect(details.trailers).toEqual([{
      name: "Official trailer",
      url: "https://www.youtube.com/watch?v=valid-key-123",
    }]);
    expect(details.cast).toHaveLength(12);
  });

  test("reports missing TMDB credentials explicitly", async () => {
    const originalToken = process.env.TMDB_ACCESS_TOKEN;
    delete process.env.TMDB_ACCESS_TOKEN;

    try {
      await expect(getMovieDiscovery()).rejects.toMatchObject({
        code: "TMDB_NOT_CONFIGURED",
        statusCode: 503,
      });
    } finally {
      if (originalToken === undefined) delete process.env.TMDB_ACCESS_TOKEN;
      else process.env.TMDB_ACCESS_TOKEN = originalToken;
    }
  });

  test("surfaces TMDB upstream rate limiting as a retryable service error", async () => {
    const originalToken = process.env.TMDB_ACCESS_TOKEN;
    process.env.TMDB_ACCESS_TOKEN = "unit-test-token";
    const requestMock = jest.spyOn(https, "request").mockImplementation((_url, _options, callback) => {
      const request = new EventEmitter();
      request.setTimeout = jest.fn();
      request.destroy = jest.fn();
      request.end = jest.fn(() => {
        process.nextTick(() => {
          const response = new EventEmitter();
          response.statusCode = 429;
          response.headers = { "retry-after": "5" };
          callback(response);
          response.emit("end");
        });
      });
      return request;
    });

    try {
      await expect(getMovieDiscovery()).rejects.toMatchObject({
        code: "TMDB_RATE_LIMITED",
        statusCode: 503,
        retryAfter: "5",
      });
    } finally {
      requestMock.mockRestore();
      if (originalToken === undefined) delete process.env.TMDB_ACCESS_TOKEN;
      else process.env.TMDB_ACCESS_TOKEN = originalToken;
    }
  });

  test("combines and de-duplicates 100 or more movies using backend bearer authentication", async () => {
    const originalToken = process.env.TMDB_ACCESS_TOKEN;
    process.env.TMDB_ACCESS_TOKEN = "unit-test-token";
    const makeMovie = (id, originalLanguage = "en") => ({
      id,
      title: `Film ${id}`,
      overview: `Overview ${id}`,
      poster_path: `/poster-${id}.jpg`,
      backdrop_path: `/backdrop-${id}.jpg`,
      release_date: "2024-01-02",
      genre_ids: [28],
      original_language: originalLanguage,
      vote_average: 8.2,
      vote_count: 250,
    });
    const requestMock = jest.spyOn(https, "request").mockImplementation((url, options, callback) => {
      const request = new EventEmitter();
      request.setTimeout = jest.fn();
      request.destroy = jest.fn();
      request.end = jest.fn(() => {
        const parsedUrl = new URL(url);
        const page = Number(parsedUrl.searchParams.get("page") || 1);
        let responseData;

        if (parsedUrl.pathname.endsWith("/configuration")) {
          responseData = {
            images: {
              secure_base_url: "https://image.tmdb.org/t/p/",
              poster_sizes: ["w342", "w500", "original"],
              backdrop_sizes: ["w780", "w1280", "original"],
            },
          };
        } else if (parsedUrl.pathname.endsWith("/genre/movie/list")) {
          responseData = { genres: [{ id: 28, name: "Action" }] };
        } else if (parsedUrl.searchParams.get("with_original_language") === "hi") {
          responseData = { results: [makeMovie(201, "hi")] };
        } else if (parsedUrl.searchParams.get("with_origin_country") === "IN") {
          responseData = { results: [makeMovie(202, "ta")] };
        } else if (parsedUrl.searchParams.get("with_origin_country") === "US") {
          responseData = { results: [makeMovie(203, "en")] };
        } else if (parsedUrl.pathname.endsWith("/discover/movie")) {
          const firstId = (page - 1) * 20 + 1;
          responseData = { results: Array.from({ length: 20 }, (_, index) => makeMovie(firstId + index)) };
        } else {
          responseData = { results: [makeMovie(1)] };
        }

        process.nextTick(() => {
          const response = new EventEmitter();
          response.statusCode = 200;
          response.headers = {};
          callback(response);
          response.emit("data", Buffer.from(JSON.stringify(responseData)));
          response.emit("end");
        });
      });
      return request;
    });

    try {
      const catalogue = await getMovieDiscovery();
      const uniqueIds = new Set(catalogue.movies.map((movie) => movie.tmdbId));

      expect(catalogue.totalDistinctMovies).toBeGreaterThanOrEqual(100);
      expect(uniqueIds.size).toBe(catalogue.totalDistinctMovies);
      expect(catalogue.movies.find((movie) => movie.tmdbId === "1")).toMatchObject({
        poster: "https://image.tmdb.org/t/p/w500/poster-1.jpg",
        backdrop: "https://image.tmdb.org/t/p/w1280/backdrop-1.jpg",
        genres: ["Action"],
        rating: 8.2,
        voteCount: 250,
      });
      expect(catalogue.categories).toMatchObject({
        trending: [1],
        bollywood: [201],
        hollywood: [203],
        indianCinema: expect.arrayContaining(["202"]),
      });
      expect(requestMock.mock.calls.every(([, options]) =>
        options.headers.Authorization === "Bearer unit-test-token")).toBe(true);
    } finally {
      requestMock.mockRestore();
      if (originalToken === undefined) delete process.env.TMDB_ACCESS_TOKEN;
      else process.env.TMDB_ACCESS_TOKEN = originalToken;
    }
  });
});
