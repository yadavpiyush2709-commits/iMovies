const bcrypt = require("bcryptjs");
const User = require("./User");

describe("User compatibility and password handling", () => {
  test("keeps legacy users active without marking their mobile verified", () => {
    const user = new User({
      name: "Existing Account",
      email: "legacy@example.com",
      password: "existing-password",
    });

    expect(user.registrationStatus).toBe("active");
    expect(user.isActive).toBe(true);
    expect(user.phoneVerified).toBeUndefined();
  });

  test("uses the existing bcrypt password hashing configuration", async () => {
    const password = "secure-test-password";
    const hash = await User.hashPassword(password);

    expect(hash).not.toBe(password);
    expect(await bcrypt.compare(password, hash)).toBe(true);
  });
});
