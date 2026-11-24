const db = require('./db');
const { route, fail, str, oneOf, butuh } = require('./_lib/http');
const { catat } = require('./_lib/util');
const I = require('./_lib/izin');

/**
 * CRUD peran & hak akses (khusus admin / izin sistem.kelola).
 * - Peran bawaan (admin, bendahara_rw, bendahara_jimpitan, pengurus_rt): boleh diubah nama & izinnya, tidak boleh dihapus.
 * - Peran buatan sendiri: boleh dihapus selama tidak dipakai akun.
 * - "Dibatasi RT": peran dengan flag ini hanya mengakses data warga/iuran/sewa di RT pada akunnya.
 * - Peran admin selalu memegang semua izin 'lihat' + mengelola sistem/warga (akses ke semua menu; tidak dapat dicabut).
 */
const slug = (v) => String(v || '').trim().toLowerCase();

async function simpanIzin(kode, izin) {
  await db.query('DELETE FROM peran_izin WHERE peran = ?', [kode]);
  for (const i of izin) await db.query('INSERT INTO peran_izin (peran, izin) VALUES (?, ?)', [kode, i]);
}
function bacaIzin(v) {
  if (!Array.isArray(v)) throw fail(400, 'Daftar izin tidak valid.');
  const bad = v.filter((i) => !I.SEMUA_IZIN.includes(i));
  if (bad.length) throw fail(400, `Izin tidak dikenal: ${bad.slice(0, 3).join(', ')}.`);
  return I.lengkapi(v);
}

module.exports = route({
  GET: {
    auth: butuh('sistem.kelola'),
    fn: async () => {
      const pakai = await db.query('SELECT role, COUNT(*) AS n FROM pengguna GROUP BY role');
      const n = new Map(pakai.rows.map((x) => [x.role, Number(x.n)]));
      return {
        peran: I.daftarPeran().map((p) => ({ ...p, jumlah_akun: n.get(p.kode) || 0 })),
        katalog: I.KATALOG, dependensi: I.DEPEN, admin_wajib: I.ADMIN_WAJIB
      };
    }
  },

  POST: {
    auth: butuh('sistem.kelola'),
    status: 201,
    fn: async (req, res, user) => {
      const b = req.body || {};
      const kode = slug(b.kode);
      if (!/^[a-z][a-z0-9_]{2,39}$/.test(kode)) throw fail(400, 'Kode peran: huruf kecil/angka/garis bawah, diawali huruf, 3–40 karakter (mis. sekretaris).');
      if (I.infoPeran(kode)) throw fail(409, 'Kode peran sudah ada.');
      const nama = str(b.nama, 'Nama peran', { min: 3, max: 80, required: true });
      const ket = str(b.keterangan, 'Keterangan', { max: 255 });
      const izin = bacaIzin(b.izin || []);
      const batasRt = b.batas_rt === true || b.batas_rt === 1 || b.batas_rt === '1' ? 1 : 0;
      const dana = b.dana_pengeluaran ? oneOf(String(b.dana_pengeluaran), 'Dana pengeluaran', I.DANA_PENGELUARAN) : 'umum';
      await db.query('INSERT INTO peran (kode, nama, keterangan, sistem, batas_rt, dana_pengeluaran) VALUES (?, ?, ?, 0, ?, ?)', [kode, nama, ket || null, batasRt, dana]);
      await simpanIzin(kode, izin);
      await I.muatUlang();
      await catat(user, 'BUAT_PERAN', `Membuat peran "${nama}" (${kode}) dengan ${izin.length} izin.`, req);
      return { kode };
    }
  },

  PUT: {
    auth: butuh('sistem.kelola'),
    fn: async (req, res, user) => {
      const b = req.body || {};
      const kode = slug(b.kode);
      const cur = I.infoPeran(kode);
      if (!cur) throw fail(404, 'Peran tidak ditemukan.');
      const nama = b.nama !== undefined ? str(b.nama, 'Nama peran', { min: 3, max: 80, required: true }) : cur.nama;
      const ket = b.keterangan !== undefined ? str(b.keterangan, 'Keterangan', { max: 255 }) : cur.keterangan;
      let izin = b.izin !== undefined ? bacaIzin(b.izin) : cur.izin;
      if (kode === 'admin') izin = I.lengkapi([...izin, ...I.ADMIN_WAJIB]); // admin selalu mengakses semua menu
      const batasRt = b.batas_rt !== undefined ? (b.batas_rt === true || b.batas_rt === 1 || b.batas_rt === '1' ? 1 : 0) : (cur.batas_rt ? 1 : 0);
      if (kode === 'admin' && batasRt) throw fail(400, 'Peran admin tidak boleh dibatasi per RT.');
      const dana = b.dana_pengeluaran !== undefined ? oneOf(String(b.dana_pengeluaran), 'Dana pengeluaran', I.DANA_PENGELUARAN) : cur.dana_pengeluaran;
      await db.query('UPDATE peran SET nama = ?, keterangan = ?, batas_rt = ?, dana_pengeluaran = ? WHERE kode = ?', [nama, ket || null, batasRt, dana, kode]);
      await simpanIzin(kode, izin);
      await I.muatUlang();
      await catat(user, 'UBAH_PERAN', `Mengubah hak akses peran "${nama}" (${kode}): ${izin.length} izin.`, req);
      return { kode };
    }
  },

  DELETE: {
    auth: butuh('sistem.kelola'),
    fn: async (req, res, user) => {
      const kode = slug((req.query || {}).kode);
      const cur = I.infoPeran(kode);
      if (!cur) throw fail(404, 'Peran tidak ditemukan.');
      if (I.PERAN_SISTEM.includes(kode)) throw fail(400, 'Peran bawaan tidak dapat dihapus (hak aksesnya boleh diubah).');
      const n = (await db.query('SELECT COUNT(*) AS n FROM pengguna WHERE role = ?', [kode])).rows[0].n;
      if (Number(n) > 0) throw fail(400, `Peran masih dipakai ${n} akun. Pindahkan akun tersebut ke peran lain dulu.`);
      await db.query('DELETE FROM peran_izin WHERE peran = ?', [kode]);
      await db.query('DELETE FROM peran WHERE kode = ?', [kode]);
      await I.muatUlang();
      await catat(user, 'HAPUS_PERAN', `Menghapus peran "${cur.nama}" (${kode}).`, req);
      return { kode };
    }
  }
});
