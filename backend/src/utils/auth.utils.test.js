const {
  generateOtp,
  hashOtp,
  normalizeEmail,
  normalizePhone,
  normalizeStoredPhone,
  otpMatches,
} = require("./auth.utils");

describe("authentication utilities", () => {
  beforeAll(() => {
    process.env.JWT_SECRET = "test-only-auth-secret";
  });

  test("generates six-digit OTP strings, including possible leading zeroes", () => {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      expect(generateOtp()).toMatch(/^\d{6}$/);
    }
  });

  test("hashes OTPs with account and channel binding", () => {
    const hash = hashOtp("user-1", "email", "001234");

    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toContain("001234");
    expect(otpMatches("user-1", "email", "001234", hash)).toBe(true);
    expect(otpMatches("user-2", "email", "001234", hash)).toBe(false);
    expect(otpMatches("user-1", "phone", "001234", hash)).toBe(false);
    expect(otpMatches("user-1", "email", "001235", hash)).toBe(false);
  });

  test("normalizes emails and international phone numbers", () => {
    expect(normalizeEmail("  FilmFan@Example.com ")).toBe("filmfan@example.com");
    expect(normalizePhone("+91 (98765) 43210")).toBe("+919876543210");
    expect(normalizePhone("9876543210")).toBeNull();
    expect(normalizePhone("9876543210", { allowLocalIndianNumber: true })).toBe("+919876543210");
    expect(normalizeStoredPhone("09876543210")).toBe("+919876543210");
  });
});
