const db = require('./db');
const { route, fail, str, int, oneOf, scopeRt, cekRtWarga, RT_LIST, butuh } = require('./_lib/http');
const { catat } = require('./_lib/util');
const { simpanSetoran, ringkasanSaldo, METODE } = require('./_lib/setoran');
const P = require('./_lib/periode');
const { pastikanTerbuka } = require('./_lib/tutupbuku');

async function ambilWarga(id) {
  const w = (await db.query('SELECT id, nama, rt, jenis, aktif, mulai_iuran, berhenti_pada, ikut_jimpitan, jimpitan_berhenti, ikut_iuran, iuran_berhenti FROM warga WHERE id = ?', [id])).rows[0];
  if (!w) throw fail(404, 'Warga tidak ditemukan.');
  return w;
}

module.exports = route({
  // Riwayat setoran (filter warga / tanggal / RT)
  GET: {
    auth: butuh('jimpitan.lihat'),
    fn: async (req, res, user) => {
      const q = req.query || {};
      const rt = scopeRt(user, q.rt ? oneOf(String(q.rt), 'RT', RT_LIST) : null);
      const where = [];
      const params = [];
      if (rt) { where.push('w.rt = ?'); params.push(rt); }
      if (q.warga_id) { where.push('s.warga_id = ?'); params.push(int(q.warga_id, 'Warga', { min: 1 })); }
      if (q.dari) { if (!P.validDate(String(q.dari))) throw fail(400, 'Tanggal "dari" tidak valid.'); where.push('s.tanggal >= ?'); params.push(String(q.dari)); }
      if (q.sampai) { if (!P.validDate(String(q.sampai))) throw fail(400, 'Tanggal "sampai" tidak valid.'); where.push('s.tanggal <= ?'); params.push(String(q.sampai)); }
      if (q.status === 'sah' || q.status === 'batal') { where.push('s.status = ?'); params.push(q.status); }
      const limit = Math.min(Number(q.limit) || 200, 1000);
      const r = await db.query(
        `SELECT s.id, s.warga_id, w.nama, w.rt, s.tanggal, s.tipe, s.periode_jenis, s.periode_kunci, s.tunggakan_id,
                s.nominal, s.metode, s.petugas, s.catatan, s.status, s.alasan_batal, s.created_at
         FROM setoran s JOIN warga w ON w.id = s.warga_id
         ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
         ORDER BY s.tanggal DESC, s.created_at DESC LIMIT ${limit}`,
        params
      );
      return { setoran: r.rows };
    }
  },

  // Catat satu setoran: nominal bebas
  POST: {
    auth: butuh('jimpitan.tulis'),
    status: 201,
    fn: async (req, res, user) => {
      const b = req.body || {};
      const warga = await ambilWarga(int(b.warga_id, 'Warga', { min: 1 }));
      cekRtWarga(user, warga.rt);
      if (!warga.aktif) throw fail(400, 'Warga ini sudah nonaktif.');
      const today = P.todayWIB();
      const tanggal = b.tanggal ? String(b.tanggal) : today;
      if (!P.validDate(tanggal)) throw fail(400, 'Tanggal tidak valid.');
      if (tanggal > today) throw fail(400, 'Tanggal setoran tidak boleh di masa depan.');
      const catatan = str(b.catatan, 'Catatan', { max: 255 }) || null;
      const metode = METODE.includes(b.metode) ? b.metode : 'tunai';

      const hasil = await simpanSetoran({ user, warga, tanggal, nominal: b.nominal, metode, catatan, abaikanDuplikat: !!b.abaikan_duplikat });
      await catat(user, 'SETORAN', `Setoran ${warga.nama} (RT ${warga.rt}) Rp ${hasil.nominal} tanggal ${tanggal} (${hasil.id}).`, req);
      return { id: hasil.id, nominal: hasil.nominal, ringkasan: await ringkasanSaldo(warga) };
    }
  },

  // Batalkan setoran (tidak dihapus; tercatat alasan). Saldo otomatis dihitung ulang.
  PUT: {
    auth: butuh('jimpitan.tulis'),
    fn: async (req, res, user) => {
      const b = req.body || {};
      const id = str(b.id, 'ID', { max: 40, required: true });
      const alasan = str(b.alasan, 'Alasan pembatalan', { min: 3, max: 255, required: true });
      const s = (await db.query(
        `SELECT s.id, s.status, s.petugas, s.tanggal, s.nominal, w.nama, w.rt
         FROM setoran s JOIN warga w ON w.id = s.warga_id WHERE s.id = ?`, [id]
      )).rows[0];
      if (!s) throw fail(404, 'Setoran tidak ditemukan.');
      cekRtWarga(user, s.rt);
      if (s.status === 'batal') throw fail(400, 'Setoran ini sudah dibatalkan.');
      await pastikanTerbuka(s.tanggal);
      await db.query("UPDATE setoran SET status = 'batal', alasan_batal = ? WHERE id = ?", [alasan, id]);
      require('./_lib/cache-publik').invalidatePublik();
      await catat(user, 'BATAL_SETORAN', `Membatalkan setoran ${id} (${s.nama}, Rp ${s.nominal}): ${alasan}`, req);
      return { id };
    }
  }
});
