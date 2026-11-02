const rateLimit = require("express-rate-limit");

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // Limit each IP to 30 login/auth requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: (req, res) => {
    if (req.xhr || req.headers.accept?.includes("json")) {
      return res.status(429).json({ error: "Too many login attempts. Please try again after 15 minutes." });
    }
    req.session.flash = {
      type: "error",
      message: "Too many attempts from this IP. Please wait a few minutes before trying again.",
    };
    return res.status(429).redirect("/login");
  },
});

const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 120, // 120 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "API rate limit exceeded. Please slow down." },
});

module.exports = { authLimiter, apiLimiter };

