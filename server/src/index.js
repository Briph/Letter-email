/**
 * letter-server/src/index.js
 * Entry point — starts the Express API server.
 */

require("dotenv").config();

const express     = require("express");
const helmet      = require("helmet");
const cors        = require("cors");
const compression = require("compression");
const rateLimit   = require("express-rate-limit");

const accountsRouter = require("./routes/accounts");
const labelsRouter   = require("./routes/labels");
const settingsRouter = require("./routes/settings");
const connectRouter  = require("./routes/connect");

// Trigger DB init on startup
require("./db");

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Security middleware ───────────────────────────────────────────────────────
app.use(helmet());
app.use(compression());

// CORS — allow the web app (localhost:3000 in dev) and Electron (file://)
const allowedOrigins = (process.env.CORS_ORIGINS || "http://localhost:3000")
  .split(",").map(o => o.trim());

app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (Electron, curl, Postman)
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin) || origin.startsWith("file://")) {
      return cb(null, true);
    }
    return cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
}));

app.use(express.json({ limit: "1mb" }));

// ── Rate limiting ─────────────────────────────────────────────────────────────
// Strict limit only on sign-in and sign-up (brute-force targets)
const strictAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max:      20,
  message:  { error: "Too many attempts, please try again later" },
  standardHeaders: true,
  legacyHeaders:   false,
});

// Relaxed limit for token refresh and /me (called frequently by normal app usage)
const softAuthLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,  // 1 minute
  max:      60,
  message:  { error: "Too many requests" },
  standardHeaders: true,
  legacyHeaders:   false,
});

const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max:      120,
  message:  { error: "Too many requests" },
  standardHeaders: true,
  legacyHeaders:   false,
});

// ── Routes ────────────────────────────────────────────────────────────────────
// Apply rate limiters before the auth router
const authRouter = require("./routes/auth");
app.post("/api/auth/signup",  strictAuthLimiter);
app.post("/api/auth/signin",  strictAuthLimiter);
app.post("/api/auth/refresh", softAuthLimiter);
app.post("/api/auth/signout", softAuthLimiter);
app.get( "/api/auth/me",      softAuthLimiter);
app.patch("/api/auth/me",     softAuthLimiter);
app.use("/api/auth", authRouter);

// connectRouter MUST be mounted before accountsRouter so that
// /api/accounts/:id/connect, /api/accounts/:id/test etc. are matched first.
// Express routes in registration order and accountsRouter would 404 these paths.
app.use("/api",          apiLimiter, connectRouter);
app.use("/api/accounts", apiLimiter, accountsRouter);
app.use("/api/labels",   apiLimiter, labelsRouter);
app.use("/api/settings", apiLimiter, settingsRouter);

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/health", (_, res) => res.json({ status: "ok", version: "1.0.0" }));

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: "Not found" }));

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  if (process.env.NODE_ENV !== "production") console.error(err);
  if (err.message?.startsWith("CORS")) return res.status(403).json({ error: err.message });
  res.status(500).json({ error: "Internal server error" });
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✓ Letter server running on http://localhost:${PORT}`);
  console.log(`  Environment: ${process.env.NODE_ENV || "development"}`);
});

module.exports = app;
