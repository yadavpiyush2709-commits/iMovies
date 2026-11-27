
require("dotenv").config();

const mongoose = require("mongoose");
const readline = require("readline");
const connectDatabase = require("../src/config/database");
const User = require("../src/models/User");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question) {
  return new Promise((resolve) => {
    rl.question(question, resolve);
  });
}

async function createAdmin() {
  try {
    await connectDatabase();

    console.log("\n=== Tesseract Films Admin Account Setup ===\n");

    const name = (await ask("Admin Name: ")).trim();
    const email = (await ask("Admin Email: ")).trim().toLowerCase();
    const password = await ask("Admin Password (minimum 8 characters): ");

    if (!name || !email || password.length < 8) {
      throw new Error("Please enter valid details. Password must be at least 8 characters.");
    }

    const existingUser = await User.findOne({ email });

    if (existingUser) {
      throw new Error("This email is already registered. Choose another email.");
    }

    const admin = await User.create({
      name,
      email,
      password,
      role: "admin",
    });

    console.log("\nAdmin account created successfully!");
    console.log("Admin ID:", admin._id);
    console.log("Admin Email:", admin.email);
    console.log("Role:", admin.role);
  } catch (error) {
    console.error("\nAdmin creation failed:", error.message);
    process.exitCode = 1;
  } finally {
    rl.close();
    await mongoose.disconnect();
  }
}

createAdmin();
