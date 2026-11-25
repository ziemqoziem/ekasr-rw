/**
 * Cache singkat untuk GET /api/publik (agregat beranda tanpa login).
 * TTL default 60 detik; dibatalkan saat ada mutasi kas/setoran/iuran.
 */
let data = null;
let at = 0;
const TTL_MS = Number(process.env.PUBLIK_CACHE_TTL_MS || 60000);

function getPublik() {
  if (data && Date.now() - at < TTL_MS) return data;
  return null;
}

function setPublik(payload) {
  data = payload;
  at = Date.now();
}

function invalidatePublik() {
  data = null;
  at = 0;
  try { require('./util').invalidateKonteks(); } catch (_) { /* ignore */ }
  try { require('./iuran').invalidateKonteksIuran(); } catch (_) { /* ignore */ }
}

module.exports = { getPublik, setPublik, invalidatePublik, TTL_MS };
