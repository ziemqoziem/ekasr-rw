const { authenticate } = require('./auth');
const { siap, punya, PERAN_SISTEM, peranTerbatasRt } = require('./izin');

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => new HttpError(status, message);

/**
 * Membuat handler Express dari peta method:
 *   route({ GET: { auth: 'public', fn: async (req, res, user) => data }, POST: { auth: ['admin'], fn } })
 * auth: 'public' | 'login' | butuh('izin.a', 'izin.b')  (salah satu izin; hak akses peran diatur admin) | ['admin',...] (kode peran)
 * fn mengembalikan objek yang dikirim sebagai JSON { success: true, ...objek },
 * atau memanggil res sendiri lalu mengembalikan undefined.
 */
function route(map) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    try {
      await siap();
      const def = map[req.method];
      if (!def) {
        res.setHeader('Allow', Object.keys(map).join(', '));
        throw fail(405, 'Metode tidak diizinkan.');
      }
      let user = null;
      if (def.auth !== 'public') {
        user = await authenticate(req);
        if (!user) throw fail(401, 'Silakan login terlebih dahulu.');
        if (Array.isArray(def.auth) && !def.auth.includes(user.role)) {
          throw fail(403, 'Anda tidak memiliki hak akses untuk tindakan ini.');
        }
        if (def.auth && def.auth.izin && !def.auth.izin.some((i) => punya(user, i))) {
          throw fail(403, 'Anda tidak memiliki hak akses untuk tindakan ini.');
        }
      } else {
        try { user = await authenticate(req); } catch (_) { user = null; }
      }
      const out = await def.fn(req, res, user);
      if (out !== undefined && !res.headersSent) res.status(def.status || 200).json({ success: true, ...out });
    } catch (e) {
      if (e instanceof HttpError) return res.status(e.status).json({ success: false, error: e.message, kode: e.kode });
      if (e && e.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ success: false, error: 'Data sudah ada (duplikat).' });
      }
      console.error('[api]', req.method, req.originalUrl, e);
      return res.status(500).json({ success: false, error: 'Terjadi kesalahan pada server.' });
    }
  };
}

// ---- Validasi sederhana
function str(v, name, { max = 255, min = 0, required = false } = {}) {
  const s = v === undefined || v === null ? '' : String(v).trim();
  if (required && !s) throw fail(400, `${name} wajib diisi.`);
  if (s && s.length < min) throw fail(400, `${name} minimal ${min} karakter.`);
  if (s.length > max) throw fail(400, `${name} maksimal ${max} karakter.`);
  return s;
}
function int(v, name, { min = 0, max = 2000000000, required = true } = {}) {
  if ((v === undefined || v === null || v === '') && !required) return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw fail(400, `${name} tidak valid.`);
  return n;
}
function oneOf(v, name, list, { required = true } = {}) {
  if ((v === undefined || v === null || v === '') && !required) return null;
  if (!list.includes(v)) throw fail(400, `${name} tidak valid.`);
  return v;
}
const RT_LIST = ['007', '008', '009'];
const JENIS_LIST = ['harian', 'mingguan', 'bulanan'];
// Hak akses diatur lewat peran (api/_lib/izin.js).
const butuh = (...izin) => ({ izin });
const ROLE_LIST = PERAN_SISTEM; // hanya peran bawaan; peran lain dibaca dari database (api/peran.js)

// Peran "dibatasi RT" hanya boleh mengakses data RT pada akunnya. scopeRt: kembalikan RT yang berlaku untuk daftar/filter.
function scopeRt(user, requested) {
  if (user && peranTerbatasRt(user.role)) {
    if (!user.rt) throw fail(403, 'Akun ini dibatasi per RT tetapi belum diatur RT-nya. Hubungi admin.');
    if (requested && requested !== user.rt) throw fail(403, 'Anda hanya dapat mengakses data RT Anda sendiri.');
    return user.rt;
  }
  return requested || null;
}
// Pastikan satu warga (atau data ber-RT) berada pada RT yang boleh diakses
function cekRtWarga(user, rtWarga) {
  scopeRt(user, rtWarga);
}

module.exports = { cekRtWarga, butuh, route, fail, HttpError, str, int, oneOf, scopeRt, RT_LIST, JENIS_LIST, ROLE_LIST };
