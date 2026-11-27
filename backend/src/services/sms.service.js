const https = require("https");

function isConfigured() {
  return (
    process.env.SMS_PROVIDER === "twilio" &&
    Boolean(
      process.env.SMS_API_KEY &&
      process.env.SMS_API_SECRET &&
      process.env.SMS_SENDER_ID
    )
  );
}

function sendMobileOtp({ phone, otp }) {
  if (!isConfigured()) {
    return Promise.reject(new Error("SMS delivery is not configured."));
  }

  const accountSid = process.env.SMS_API_KEY;
  const payload = new URLSearchParams({
    To: phone,
    From: process.env.SMS_SENDER_ID,
    Body: `Your Tesseract Films verification code is ${otp}. It expires in 5 minutes.`,
  }).toString();

  return new Promise((resolve, reject) => {
    const request = https.request(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`,
      {
        method: "POST",
        auth: `${accountSid}:${process.env.SMS_API_SECRET}`,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (response) => {
        response.resume();
        response.on("end", () => {
          if (response.statusCode >= 200 && response.statusCode < 300) {
            resolve();
          } else {
            reject(new Error("SMS delivery failed."));
          }
        });
      }
    );

    request.setTimeout(10000, () => {
      request.destroy(new Error("SMS delivery timed out."));
    });
    request.on("error", () => reject(new Error("SMS delivery failed.")));
    request.write(payload);
    request.end();
  });
}

module.exports = {
  isConfigured,
  sendMobileOtp,
};
