const db = require('./db');
const { route, fail, int, butuh, cekRtWarga } = require('./_lib/http');
const { bangunKonteks, hitungSaldo } = require('./_lib/util');

// Saldo satu warga + 30 setoran terakhir
module.exports = route({
  GET: {
    auth: butuh('jimpitan.lihat'),
    fn: async (req, res, user) => {
      const id = int((req.query || {}).warga_id, 'Warga', { min: 1 });
      const w = (await db.query('SELECT id, nama, rt, jenis, aktif, mulai_iuran, berhenti_pada, ikut_jimpitan, jimpitan_berhenti, ikut_iuran, iuran_berhenti FROM warga WHERE id = ?', [id])).rows[0];
      if (!w) throw fail(404, 'Warga tidak ditemukan.');
      cekRtWarga(user, w.rt);
      const ctx = await bangunKonteks();
      const s = hitungSaldo([w], ctx).get(w.id);
      const r = await db.query(
        `SELECT id, tanggal, nominal, metode, petugas, catatan, status, alasan_batal FROM setoran
         WHERE warga_id = ? ORDER BY tanggal DESC, created_at DESC LIMIT 30`, [id]
      );
      return {
        warga: { id: w.id, nama: w.nama, rt: w.rt, jenis: w.jenis },
        tarif_harian: ctx.tarifNow, mulai_hitung: ctx.mulaiHitung,
        saldo: s, setoran: r.rows.map((x) => ({ ...x, tanggal: String(x.tanggal).slice(0, 10) }))
      };
    }
  }
});
