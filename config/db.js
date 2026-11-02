const mongoose = require("mongoose");
async function connectDB() {
  const uri =
    process.env.MONGO_URI || "mongodb://127.0.0.1:27017/student_management";
  await mongoose.connect(uri);
  console.log("MongoDB connected successfully");
}
mongoose.connection.on("error", (err) =>
  console.error("MongoDB error:", err.message),
);
module.exports = { connectDB, mongoose };
