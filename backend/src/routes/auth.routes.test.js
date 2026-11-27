const express = require("express");
const request = require("supertest");

jest.mock("../controllers/auth.controller", () => ({
  login: (_req, res) => res.status(401).json({
    success: false,
    message: "Invalid email/mobile number or password",
  }),
  requestPasswordReset: (_req, res) => res.status(202).json({ success: true }),
  resetPassword: (_req, res) => res.json({ success: true }),
}));

jest.mock("../controllers/registration.controller", () => ({
  register: (_req, res) => res.status(201).json({ success: true }),
  resendRegistrationOtp: (_req, res) => res.json({ success: true }),
  verifyRegistrationOtp: (_req, res) => res.json({ success: true }),
  requestMobileVerification: (_req, res) => res.json({ success: true }),
  resendMobileVerification: (_req, res) => res.json({ success: true }),
  verifyMobileNumber: (_req, res) => res.json({ success: true }),
}));

const authRoutes = require("./auth.routes");

describe("authentication route rate limits", () => {
  const app = express();
  app.use(express.json());
  app.use("/api/auth", authRoutes);

  test("limits failed login attempts and leaves registration limits independent", async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await request(app)
        .post("/api/auth/login")
        .send({ identifier: "person@example.com", password: "incorrect-password" });

      expect(response.status).toBe(401);
    }

    const limitedResponse = await request(app)
      .post("/api/auth/login")
      .send({ identifier: "person@example.com", password: "incorrect-password" });

    expect(limitedResponse.status).toBe(429);
    expect(limitedResponse.body).toEqual({
      success: false,
      message: "Too many login attempts. Please wait 15 minutes before trying again.",
    });
    expect(JSON.stringify(limitedResponse.body)).not.toMatch(/password|token|person@example\.com/i);

    const registrationResponse = await request(app)
      .post("/api/auth/register")
      .send({});

    expect(registrationResponse.status).toBe(201);
  });
});
