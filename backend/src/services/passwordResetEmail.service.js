const https = require("https");

function isConfigured() {
  return Boolean(
    process.env.RESEND_API_KEY &&
    process.env.EMAIL_FROM &&
    process.env.CLIENT_URL
  );
}

function createResetUrl(token) {
  const resetUrl = new URL("/reset-password", process.env.CLIENT_URL);

  if (
    resetUrl.protocol !== "https:" &&
    resetUrl.hostname !== "localhost" &&
    resetUrl.hostname !== "127.0.0.1"
  ) {
    throw new Error("Password reset links require HTTPS.");
  }

  resetUrl.searchParams.set("token", token);
  return resetUrl.toString();
}

function sendPasswordResetEmail({ email, resetUrl }) {
  return sendEmail({
    from: process.env.EMAIL_FROM,
    to: [email],
    subject: "Reset your Tesseract Films password",
    html: [
      "<p>We received a request to reset your Tesseract Films password.</p>",
      `<p><a href="${resetUrl}">Reset your password</a></p>`,
      "<p>This link expires in 15 minutes. If you did not request this, you can ignore this email.</p>",
    ].join(""),
  });
}

function sendRegistrationOtpEmail({ email, otp }) {
  return sendEmail({
    from: process.env.EMAIL_FROM,
    to: [email],
    subject: "Verify your Tesseract Films email",
    text: `Your Tesseract Films verification code is ${otp}. It expires in 5 minutes.`,
    html: `<p>Your Tesseract Films verification code is <strong>${otp}</strong>.</p><p>It expires in 5 minutes. If you did not start this registration, you can ignore this email.</p>`,
  });
}

function sendEmail(message) {
  const payload = JSON.stringify(message);
  return new Promise((resolve, reject) => {
    const request = https.request(
      "https://api.resend.com/emails",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (response) => {
        response.resume();
        response.on("end", () => {
          if (response.statusCode >= 200 && response.statusCode < 300) {
            resolve();
          } else {
            reject(new Error("Email delivery failed."));
          }
        });
      }
    );

    request.setTimeout(10000, () => {
      request.destroy(new Error("Email delivery timed out."));
    });
    request.on("error", () => reject(new Error("Email delivery failed.")));
    request.write(payload);
    request.end();
  });
}

module.exports = {
  createResetUrl,
  isConfigured,
  sendRegistrationOtpEmail,
  sendPasswordResetEmail,
};
