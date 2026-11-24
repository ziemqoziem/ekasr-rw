const db = require('../db');
const { route, fail, str } = require('../_lib/http');
const { verifyPassword, signToken, loginAllowed, loginFailed, loginOk } = require('../_lib/auth');
const { catat } = require('../_lib/util');

// Hash palsu agar waktu respons tetap serupa saat username tidak ada
const DUMMY = 'scrypt$00000000000000000000000000000000$' + '00'.repeat(64);

module.exports = route({
  POST: {
    auth: 'public',
    fn: async (req) => {
      const ip = req.ip || '-';
      if (!loginAllowed(ip)) throw fail(429, 'Terlalu banyak percobaan login. Coba lagi dalam 15 menit.');
      const body = req.body || {};
      const username = str(body.username, 'Username', { max: 50, required: true }).toLowerCase();
      const password = str(body.password, 'Password', { max: 200, required: true });

      const r = await db.query('SELECT * FROM pengguna WHERE username = ? AND aktif = 1 LIMIT 1', [username]);
      const u = r.rows[0];
      const ok = verifyPassword(password, u ? u.password_hash : DUMMY) && !!u;
      if (!ok) {
        loginFailed(ip);
        await catat({ username }, 'LOGIN_GAGAL', `Percobaan login gagal untuk "${username}".`, req);
        throw fail(401, 'Username atau password salah.');
      }
      loginOk(ip);
      await catat(u, 'LOGIN', 'Login berhasil.', req);
      return {
        token: signToken(u),
        user: { username: u.username, nama: u.nama, role: u.role, rt: u.rt, izin: require('../_lib/izin').izinUntuk(u.role), role_nama: (require('../_lib/izin').infoPeran(u.role) || {}).nama || u.role, batas_rt: !!(require('../_lib/izin').infoPeran(u.role) || {}).batas_rt }
      };
    }
  }
});
