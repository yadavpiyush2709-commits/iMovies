jest.mock("../models/User", () => ({
  findOne: jest.fn(),
  find: jest.fn(),
  findById: jest.fn(),
  updateOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
  hashPassword: jest.fn(),
}));

jest.mock("../services/passwordResetEmail.service", () => ({
  isConfigured: jest.fn(),
  createResetUrl: jest.fn(),
  sendPasswordResetEmail: jest.fn(),
}));

const User = require("../models/User");
const auth = require("./auth.controller");

function createResponse() {
  return {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

describe("authentication login", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_SECRET = "test-only-auth-secret";
  });

  test("allows existing email/password users to log in without OTP", async () => {
    const user = {
      _id: "legacy-user-id",
      email: "legacy@example.com",
      name: "Legacy User",
      role: "customer",
      isActive: true,
      comparePassword: jest.fn().mockResolvedValue(true),
    };
    User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(user) });
    const res = createResponse();

    await auth.login(
      { body: { identifier: "Legacy@Example.com", password: "existing-password" } },
      res,
      jest.fn()
    );

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toBeTruthy();
    expect(User.findOne).toHaveBeenCalledWith({ email: "legacy@example.com" });
    expect(user.comparePassword).toHaveBeenCalledWith("existing-password");
  });

  test("allows verified mobile/password login without sending OTP", async () => {
    const user = {
      _id: "verified-mobile-user",
      email: "mobile@example.com",
      phone: "+919876543210",
      phoneVerified: true,
      name: "Mobile User",
      role: "customer",
      isActive: true,
      comparePassword: jest.fn().mockResolvedValue(true),
    };
    User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(user) });
    const res = createResponse();

    await auth.login(
      { body: { identifier: "9876543210", password: "existing-password" } },
      res,
      jest.fn()
    );

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(User.findOne).toHaveBeenCalledWith({ phoneClaim: "+919876543210" });
    expect(user.comparePassword).toHaveBeenCalledWith("existing-password");
  });

  test("does not allow a pending new account to obtain a login session", async () => {
    const user = {
      _id: "pending-user-id",
      registrationStatus: "pending",
      comparePassword: jest.fn(),
    };
    User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(user) });
    const res = createResponse();

    await auth.login(
      { body: { identifier: "pending@example.com", password: "pending-password" } },
      res,
      jest.fn()
    );

    expect(res.statusCode).toBe(403);
    expect(res.body.message).toMatch(/verify your email address and mobile number/i);
    expect(user.comparePassword).not.toHaveBeenCalled();
  });
});
