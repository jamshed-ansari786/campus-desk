require("dotenv").config();
const http = require("http");
const express = require("express");
const session = require("express-session");
const path = require("path");
const { connectDB } = require("./config/db");
const flashMiddleware = require("./middleware/flash");
const { sanitizeNoSql } = require("./middleware/security");
const { initSocket } = require("./services/socketService");

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 8000;
const HOST = process.env.HOST || "0.0.0.0";

if (!process.env.SESSION_SECRET) {
  console.error("Missing SESSION_SECRET. Copy .env.example to .env.");
  process.exit(1);
}

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: false, limit: "20kb" }));
app.use(express.static(path.join(__dirname, "public")));

// Security & Sanitization
app.use(sanitizeNoSql);

// Shared session middleware
const sessionMiddleware = session({
  name: "sms.sid",
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 8, // 8 hours
  },
});
app.use(sessionMiddleware);
app.use(flashMiddleware);

// Initialize Socket.IO with HTTP server and shared session
initSocket(server, sessionMiddleware);

// Root Router
app.get("/", (req, res) => {
  if (!req.session.user)
    return res.render("home", {
      title: "Student Management System",
      isHome: true,
    });
  if (req.session.user.role === "ADMIN") return res.redirect("/admin");
  if (req.session.user.role === "TEACHER") return res.redirect("/teacher");
  return res.redirect("/student");
});

// Routes
app.use("/", require("./routes/auth"));
app.use("/colleges", require("./routes/colleges"));
app.use("/admin", require("./routes/admin"));
app.use("/api/admin", require("./routes/admin-api"));
app.use("/student", require("./routes/student"));
app.use("/teacher", require("./routes/teacher"));
app.use("/", require("./routes/chat"));
app.use("/", require("./routes/notifications"));

app.get("/health", (req, res) =>
  res.json({
    status: "ok",
    database:
      require("mongoose").connection.readyState === 1
        ? "connected"
        : "disconnected",
  }),
);

// 404 Handler
app.use((req, res) =>
  res.status(404).render("error", {
    title: "Page not found",
    message: "The page you are looking for was not found.",
  }),
);

// Error Handler
app.use((error, req, res, next) => {
  console.error(error);
  if (res.headersSent) return next(error);
  res.status(500).render("error", {
    title: "Server error",
    message:
      process.env.NODE_ENV === "production"
        ? "There was a problem. Please try again later."
        : error.message,
  });
});

async function start() {
  try {
    await connectDB();
    server.listen(PORT, HOST, () => {
      console.log(`Student Management System listening on ${HOST}:${PORT}`);
      console.log(`Local URL: http://localhost:${PORT}`);
    });
  } catch (e) {
    console.error("Database connection failed:", e.message);
    process.exit(1);
  }
}

if (require.main === module) {
  start();
}

module.exports = { app, server };
