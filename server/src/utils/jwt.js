/**
 * letter-server/src/utils/jwt.js
 * Sign and verify access + refresh tokens.
 */

const jwt    = require("jsonwebtoken");
const crypto = require("crypto");

const ACCESS_SECRET  = process.env.JWT_SECRET         || "dev_access_secret_change_me";
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET  || "dev_refresh_secret_change_me";
const ACCESS_TTL     = process.env.JWT_EXPIRES_IN      || "15m";
const REFRESH_TTL    = process.env.JWT_REFRESH_EXPIRES_IN || "30d";

function signAccess(payload) {
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: ACCESS_TTL });
}

function signRefresh(payload) {
  return jwt.sign(payload, REFRESH_SECRET, { expiresIn: REFRESH_TTL });
}

function verifyAccess(token) {
  return jwt.verify(token, ACCESS_SECRET);
}

function verifyRefresh(token) {
  return jwt.verify(token, REFRESH_SECRET);
}

/** Hash a refresh token for safe storage (never store raw JWTs in DB) */
function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** Parse expiry from a JWT without verifying (used to calculate expires_at) */
function getExpiry(token) {
  const decoded = jwt.decode(token);
  if (!decoded || typeof decoded.exp !== "number") {
    throw new Error("Token missing exp claim");
  }
  return decoded.exp; // unix seconds
}

module.exports = { signAccess, signRefresh, verifyAccess, verifyRefresh, hashToken, getExpiry };
