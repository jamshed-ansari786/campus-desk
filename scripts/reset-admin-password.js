require("dotenv").config();
const bcrypt = require("bcryptjs");
const { connectDB, mongoose } = require("../config/db");
const { Admin, AdminLogin } = require("../models");

async function resetAdminPassword() {
  const email = String(process.env.ADMIN_EMAIL || "")
    .trim()
    .toLowerCase();
  const password = String(process.env.ADMIN_PASSWORD || "");

  if (!email || !/^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(email)) {
    throw new Error("Set a valid ADMIN_EMAIL in the environment.");
  }
  if (
    password.length < 12 ||
    Buffer.byteLength(password, "utf8") > 72 ||
    !/[A-Z]/.test(password) ||
    !/[a-z]/.test(password) ||
    !/[0-9]/.test(password) ||
    !/[^A-Za-z0-9]/.test(password)
  ) {
    throw new Error(
      "Set an ADMIN_PASSWORD with 12–72 UTF-8 bytes, including uppercase, lowercase, number, and special character.",
    );
  }

  await connectDB();
  const admin = await Admin.findOne({ email });
  if (!admin) {
    throw new Error(
      "No admin profile matches ADMIN_EMAIL. Run npm run db:seed first.",
    );
  }
  if (admin.status !== "ACTIVE") {
    throw new Error(
      "The admin profile is not active. An administrator must reactivate it before resetting its password.",
    );
  }

  const login = await AdminLogin.findOne({ adminId: admin._id });
  const passwordHash = await bcrypt.hash(password, 12);
  if (login) {
    login.passwordHash = passwordHash;
    login.status = "ACTIVE";
    await login.save();
  } else {
    await AdminLogin.create({
      adminId: admin._id,
      username: process.env.ADMIN_USERNAME?.trim() || email,
      passwordHash,
      status: "ACTIVE",
    });
  }

  console.log("Admin password hash updated successfully.");
}

resetAdminPassword()
  .catch((error) => {
    console.error("Admin password reset failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState) {
      await mongoose.connection.close();
    }
  });
