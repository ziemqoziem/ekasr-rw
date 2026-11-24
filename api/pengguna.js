const db = require('./db');
const { route, fail, str, int, RT_LIST, butuh } = require('./_lib/http');
const { hashPassword } = require('./_lib/auth');
const { infoPeran, peranTerbatasRt } = require('./_lib/izin');
const { catat } = require('./_lib/util');

const COLS = 'id, username, nama, role, rt, aktif, created_at';

function cekPassword(p) {
  const s = String(p || '');
  if (s.length < 8) throw fail(400, 'Password minimal 8 karakter.');
  if (s.length > 200) throw fail(400, 'Password terlalu panjang.');
  return s;
}
// Peran harus ada (bawaan atau buatan admin di Hak Akses)
function cekPeran(role) {
  if (!infoPeran(String(role || ''))) throw fail(400, 'Peran tidak valid.');
  return String(role);
}
// Peran "dibatasi RT" (mis. Pengurus RT) wajib punya RT pada akunnya
function cekRt(role, rt) {
  if (peranTerbatasRt(role)) {
    if (!RT_LIST.includes(rt)) throw fail(400, 'Peran ini dibatasi per RT: RT wajib dipilih (007/008/009).');
    return rt;
  }
  return rt && RT_LIST.includes(rt) ? rt : null;
}
async function adminAktifLain(excludeId) {
  const r = await db.query("SELECT COUNT(*) AS n FROM pengguna WHERE role = 'admin' AND aktif = 1 AND id <> ?", [excludeId]);
  return r.rows[0].n;
}

module.exports = route({
  GET: {
    auth: butuh('sistem.kelola'),
    fn: async () => {
      const r = await db.query(`SELECT ${COLS} FROM pengguna ORDER BY (role = 'admin') DESC, role, rt, nama`);
      return { pengguna: r.rows };
    }
  },
  POST: {
    auth: butuh('sistem.kelola'),
    status: 201,
    fn: async (req, res, user) => {
      const b = req.body || {};
      const username = str(b.username, 'Username', { min: 3, max: 50, required: true }).toLowerCase();
      if (!/^[a-z0-9._-]+$/.test(username)) throw fail(400, 'Username hanya boleh huruf kecil, angka, titik, strip, dan garis bawah.');
      const nama = str(b.nama, 'Nama', { min: 2, max: 150, required: true });
      const role = cekPeran(b.role);
      const rt = cekRt(role, b.rt);
      const hash = hashPassword(cekPassword(b.password));
      const r = await db.query(
        'INSERT INTO pengguna (username, password_hash, nama, role, rt) VALUES (?, ?, ?, ?, ?)',
        [username, hash, nama, role, rt]
      );
      await catat(user, 'BUAT_AKUN', `Membuat akun @${username} (${nama}) role ${role}${rt ? ' RT ' + rt : ''}.`, req);
      const row = await db.query(`SELECT ${COLS} FROM pengguna WHERE id = ?`, [r.insertId]);
      return { pengguna: row.rows[0] };
    }
  },
  PUT: {
    auth: butuh('sistem.kelola'),
    fn: async (req, res, user) => {
      const b = req.body || {};
      const id = int(b.id, 'ID', { min: 1 });
      const cur = (await db.query('SELECT * FROM pengguna WHERE id = ?', [id])).rows[0];
      if (!cur) throw fail(404, 'Akun tidak ditemukan.');

      const nama = b.nama !== undefined ? str(b.nama, 'Nama', { min: 2, max: 150, required: true }) : cur.nama;
      const role = b.role !== undefined ? cekPeran(b.role) : cur.role;
      const rt = cekRt(role, b.rt !== undefined ? b.rt : cur.rt);
      const aktif = b.aktif !== undefined ? (b.aktif ? 1 : 0) : (cur.aktif ? 1 : 0);

      const hilangAdmin = cur.role === 'admin' && cur.aktif && (role !== 'admin' || !aktif);
      if (hilangAdmin) {
        if (cur.id === user.id) throw fail(400, 'Anda tidak dapat menurunkan atau menonaktifkan akun Anda sendiri.');
        if ((await adminAktifLain(cur.id)) < 1) throw fail(400, 'Harus ada minimal satu admin aktif.');
      }

      let sql = 'UPDATE pengguna SET nama = ?, role = ?, rt = ?, aktif = ?, updated_at = NOW()';
      const params = [nama, role, rt, aktif];
      if (b.password) {
        sql += ', password_hash = ?';
        params.push(hashPassword(cekPassword(b.password)));
      }
      sql += ' WHERE id = ?';
      params.push(id);
      await db.query(sql, params);
      await catat(user, 'UBAH_AKUN', `Mengubah akun @${cur.username}: role ${role}${rt ? ' RT ' + rt : ''}, ${aktif ? 'aktif' : 'nonaktif'}${b.password ? ', password diganti' : ''}.`, req);
      const row = await db.query(`SELECT ${COLS} FROM pengguna WHERE id = ?`, [id]);
      return { pengguna: row.rows[0] };
    }
  }
});
