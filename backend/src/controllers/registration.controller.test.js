jest.mock("../models/User", () => {
  const User = jest.fn(function UserDocument(values) {
    Object.assign(this, values);
    this._id = "test-user-id";
    this.save = jest.fn().mockResolvedValue(this);
  });
  User.exists = jest.fn();
  User.find = jest.fn();
  User.findOne = jest.fn();
  User.findOneAndUpdate = jest.fn();
  User.findById = jest.fn();
  User.updateOne = jest.fn();
  return User;
});

jest.mock("../services/passwordResetEmail.service", () => ({
  isConfigured: jest.fn(),
  sendRegistrationOtpEmail: jest.fn(),
}));

jest.mock("../services/sms.service", () => ({
  isConfigured: jest.fn(),
  sendMobileOtp: jest.fn(),
}));

const User = require("../models/User");
const emailService = require("../services/passwordResetEmail.service");
const smsService = require("../services/sms.service");
const { hashOtp } = require("../utils/auth.utils");
const registration = require("./registration.controller");

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

function createLegacyPhoneQuery(rows = []) {
  return {
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(rows),
  };
}

function validRegistration() {
  return {
    name: "Cinema Fan",
    email: "fan@example.com",
    phone: "+91 98765 43210",
    password: "correct-horse-battery",
    confirmPassword: "correct-horse-battery",
  };
}

describe("registration and OTP verification", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_SECRET = "test-only-auth-secret";
    emailService.isConfigured.mockReturnValue(true);
    smsService.isConfigured.mockReturnValue(true);
    emailService.sendRegistrationOtpEmail.mockResolvedValue();
    smsService.sendMobileOtp.mockResolvedValue();
    User.exists.mockResolvedValue(false);
    User.find.mockReturnValue(createLegacyPhoneQuery());
  });

  test("does not create an account when email OTP delivery is not configured", async () => {
    emailService.isConfigured.mockReturnValue(false);
    const res = createResponse();

    await registration.register({ body: validRegistration() }, res, jest.fn());

    expect(res.statusCode).toBe(503);
    expect(res.body.message).toMatch(/RESEND_API_KEY/);
    expect(User).not.toHaveBeenCalled();
  });

  test("does not create an account when SMS OTP delivery is not configured", async () => {
    smsService.isConfigured.mockReturnValue(false);
    const res = createResponse();

    await registration.register({ body: validRegistration() }, res, jest.fn());

    expect(res.statusCode).toBe(503);
    expect(res.body.message).toMatch(/SMS_PROVIDER/);
    expect(User).not.toHaveBeenCalled();
  });

  test("rejects duplicate email before creating a pending user", async () => {
    User.exists.mockResolvedValueOnce(true);
    const res = createResponse();

    await registration.register({ body: validRegistration() }, res, jest.fn());

    expect(res.statusCode).toBe(409);
    expect(res.body.message).toMatch(/email address already exists/i);
    expect(User).not.toHaveBeenCalled();
  });

  test("rejects a mobile number matching a legacy user record", async () => {
    User.exists.mockResolvedValueOnce(false).mockResolvedValueOnce(false);
    User.find.mockReturnValue(createLegacyPhoneQuery([
      { _id: "legacy-user", phone: "9876543210" },
    ]));
    const res = createResponse();

    await registration.register({ body: validRegistration() }, res, jest.fn());

    expect(res.statusCode).toBe(409);
    expect(res.body.message).toMatch(/mobile number already exists/i);
    expect(User).not.toHaveBeenCalled();
  });

  test("creates a pending account and requests both OTP deliveries without returning either code", async () => {
    const res = createResponse();

    await registration.register({ body: validRegistration() }, res, jest.fn());

    const user = User.mock.instances[0];
    expect(res.statusCode).toBe(201);
    expect(user.registrationStatus).toBe("pending");
    expect(user.isActive).toBe(false);
    expect(user.emailVerified).toBe(false);
    expect(user.phoneVerified).toBe(false);
    expect(user.emailOtpHash).toMatch(/^[a-f0-9]{64}$/);
    expect(user.phoneOtpHash).toMatch(/^[a-f0-9]{64}$/);
    expect(user.emailOtpExpiresAt.getTime() - Date.now()).toBeLessThanOrEqual(5 * 60 * 1000);
    expect(user.emailOtpExpiresAt.getTime() - Date.now()).toBeGreaterThan(4 * 60 * 1000);
    expect(emailService.sendRegistrationOtpEmail).toHaveBeenCalledWith(
      expect.objectContaining({ email: "fan@example.com", otp: expect.stringMatching(/^\d{6}$/) })
    );
    expect(smsService.sendMobileOtp).toHaveBeenCalledWith(
      expect.objectContaining({ phone: "+919876543210", otp: expect.stringMatching(/^\d{6}$/) })
    );
    expect(res.body.registration.delivery).toEqual({ email: "accepted", mobile: "accepted" });
    expect(res.body.registration.emailOtp).toBeUndefined();
    expect(res.body.registration.phoneOtp).toBeUndefined();
    expect(res.body.token).toBeUndefined();
  });

  test("rejects an expired OTP", async () => {
    const user = {
      _id: "test-user-id",
      registrationStatus: "pending",
      emailVerified: false,
      emailOtpHash: hashOtp("test-user-id", "email", "001234"),
      emailOtpExpiresAt: new Date(Date.now() - 1000),
      emailOtpAttempts: 0,
    };
    User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(user) });
    User.updateOne.mockResolvedValue({ modifiedCount: 1 });
    const res = createResponse();

    await registration.verifyRegistrationOtp(
      { body: { email: "fan@example.com", channel: "email", otp: "001234" } },
      res,
      jest.fn()
    );

    expect(res.statusCode).toBe(410);
    expect(res.body.message).toMatch(/expired/i);
    expect(User.updateOne).toHaveBeenCalled();
  });

  test("enforces the resend cooldown without calling the delivery provider", async () => {
    User.findOne.mockReturnValue({
      select: jest.fn().mockResolvedValue({
        _id: "test-user-id",
        registrationStatus: "pending",
        emailVerified: false,
        emailOtpResendAt: new Date(Date.now() + 30 * 1000),
      }),
    });
    const res = createResponse();

    await registration.resendRegistrationOtp(
      { body: { email: "fan@example.com", channel: "email" } },
      res,
      jest.fn()
    );

    expect(res.statusCode).toBe(429);
    expect(res.body.retryAfterSeconds).toBeGreaterThan(0);
    expect(emailService.sendRegistrationOtpEmail).not.toHaveBeenCalled();
  });

  test("limits incorrect codes to the configured per-account attempt limit", async () => {
    const user = {
      _id: "test-user-id",
      registrationStatus: "pending",
      emailVerified: false,
      emailOtpHash: hashOtp("test-user-id", "email", "001234"),
      emailOtpExpiresAt: new Date(Date.now() + 60 * 1000),
      emailOtpAttempts: 5,
    };
    User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(user) });
    const res = createResponse();

    await registration.verifyRegistrationOtp(
      { body: { email: "fan@example.com", channel: "email", otp: "001234" } },
      res,
      jest.fn()
    );

    expect(res.statusCode).toBe(429);
    expect(res.body.message).toMatch(/too many incorrect codes/i);
    expect(User.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test("consumes a valid OTP once and returns verification status without requiring login OTP", async () => {
    const user = {
      _id: "test-user-id",
      registrationStatus: "pending",
      isActive: false,
      emailVerified: false,
      phoneVerified: false,
      emailOtpHash: hashOtp("test-user-id", "email", "001234"),
      emailOtpExpiresAt: new Date(Date.now() + 60 * 1000),
      emailOtpAttempts: 0,
    };
    const verifiedUser = { ...user, emailVerified: true, emailOtpHash: undefined };
    User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(user) });
    User.findOneAndUpdate.mockResolvedValue(verifiedUser);
    const res = createResponse();

    await registration.verifyRegistrationOtp(
      { body: { email: "fan@example.com", channel: "email", otp: "001234" } },
      res,
      jest.fn()
    );

    expect(res.statusCode).toBe(200);
    expect(res.body.verification).toEqual({
      emailVerified: true,
      phoneVerified: false,
      accountActive: false,
    });
    expect(res.body.token).toBeUndefined();
    expect(User.findOneAndUpdate.mock.calls[0][1].$unset.emailOtpHash).toBe(1);

    User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(verifiedUser) });
    const reusedResponse = createResponse();
    await registration.verifyRegistrationOtp(
      { body: { email: "fan@example.com", channel: "email", otp: "001234" } },
      reusedResponse,
      jest.fn()
    );
    expect(reusedResponse.statusCode).toBe(409);
  });
});
