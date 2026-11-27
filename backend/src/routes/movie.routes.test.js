const express = require("express");
const request = require("supertest");
const movieRoutes = require("./movie.routes");

const app = express();
app.use("/movies", movieRoutes);

describe("TMDB movie routes", () => {
  let originalToken;

  beforeEach(() => {
    originalToken = process.env.TMDB_ACCESS_TOKEN;
    delete process.env.TMDB_ACCESS_TOKEN;
  });

  afterEach(() => {
    if (originalToken === undefined) delete process.env.TMDB_ACCESS_TOKEN;
    else process.env.TMDB_ACCESS_TOKEN = originalToken;
  });

  test("explains that movie discovery requires backend credentials", async () => {
    const response = await request(app).get("/movies/discovery");

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({
      success: false,
      code: "TMDB_NOT_CONFIGURED",
    });
    expect(response.body.message).toContain("TMDB_ACCESS_TOKEN");
  });

  test("rejects malformed TMDB IDs without making an upstream request", async () => {
    process.env.TMDB_ACCESS_TOKEN = "test-only-placeholder";
    const response = await request(app).get("/movies/tmdb/not-a-number");

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      success: false,
      code: "INVALID_TMDB_ID",
    });
  });

  test("rate-limits repeated public discovery requests", async () => {
    let response;
    for (let attempt = 0; attempt < 21; attempt += 1) {
      response = await request(app).get("/movies/discovery");
    }

    expect(response.status).toBe(429);
    expect(response.body.message).toMatch(/too many movie discovery requests/i);
  });
});
