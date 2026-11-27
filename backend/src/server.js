require("dotenv").config();

const http = require("http");
const { Server } = require("socket.io");
const app = require("./app");
const connectDatabase = require("./config/database");
const { startBookingExpiryJob } = require("./services/bookingExpiry.service");

const PORT = process.env.PORT || 5000;
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: app.get("corsAllowedOrigins") },
});

app.set("io", io);

connectDatabase()
  .then(() => {
    startBookingExpiryJob();
    server.listen(PORT, () => {
      console.log(`Tesseract Films server listening on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error("Failed to start server:", error.message);
    process.exit(1);
  });

