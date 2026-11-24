const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('../db');

// ---- Rahasia token: dari env TOKEN_SECRET, atau dibuat otomatis & disimpan di .token_secret
function loadSecret() {
  if (process.env.TOKEN_SECRET && process.env.TOKEN_SECRET.length >= 16) return process.env.TOKEN_SECRET;
  const file = path.join(__dirname, '..', '..', '.token_secret');
  try {
    const s = fs.readFileSync(file, 'utf8').trim();
    if (s.length >= 32) return s;
  } catch (_) { /* belum ada */ }
  const s = crypto.randomBytes(48).toString('hex');
  fs.writeFileSync(file, s, { mode: 0o600 });
  return s;
}
const SECRET = loadSecret();
const TOKEN_TTL_MS = 12 * 3600 * 1000; // 12 jam

// ---- Password (scrypt)
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}
function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const expected = Buffer.from(parts[2], 'hex');
  const actual = crypto.scryptSync(String(password), parts[1], expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

// ---- Token HMAC stateless
const b64 = (b) => Buffer.from(b).toString('base64url');
function signToken(user) {
  const payload = b64(JSON.stringify({ u: user.username, exp: Date.now() + TOKEN_TTL_MS }));
  const sig = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}
function readToken(header) {
  const m = /^Bearer\s+(.+)$/i.exec(header || '');
  if (!m) return null;
  const [payload, sig] = m[1].split('.');
  if (!payload || !sig) return null;
  const expected = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return data.exp > Date.now() ? data : null;
  } catch (_) {
    return null;
  }
}

// Ambil pengguna aktif dari database berdasarkan token (role selalu diambil terbaru dari DB)
async function authenticate(req) {
  const t = readToken(req.headers.authorization);
  if (!t) return null;
  const r = await db.query(
    'SELECT id, username, nama, role, rt FROM pengguna WHERE username = ? AND aktif = 1 LIMIT 1',
    [t.u]
  );
  return r.rows[0] || null;
}

// ---- Pembatas percobaan login (per IP)
const attempts = new Map();
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000;
function loginAllowed(ip) {
  const now = Date.now();
  const a = attempts.get(ip);
  if (!a || now - a.first > WINDOW_MS) return true;
  return a.count < MAX_ATTEMPTS;
}
function loginFailed(ip) {
  const now = Date.now();
  const a = attempts.get(ip);
  if (!a || now - a.first > WINDOW_MS) attempts.set(ip, { first: now, count: 1 });
  else a.count += 1;
}
function loginOk(ip) { attempts.delete(ip); }

module.exports = { hashPassword, verifyPassword, signToken, authenticate, loginAllowed, loginFailed, loginOk };
