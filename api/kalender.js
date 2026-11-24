const db = require('./db');
const { route, fail, int, butuh, cekRtWarga } = require('./_lib/http');
const { bangunKonteks } = require('./_lib/util');
const { bangunKalender } = require('./_lib/kalender');

// Kalender setoran satu warga (login). Default 3 bulan berakhir di bulan `bulan`.
module.exports = route({
  GET: {
    auth: butuh('jimpitan.lihat'),
    fn: async (req, res, user) => {
      const q = req.query || {};
      const id = int(q.warga_id, 'Warga', { min: 1 });
      const w = (await db.query('SELECT id, nama, rt, jenis, aktif, mulai_iuran, berhenti_pada, ikut_jimpitan, jimpitan_berhenti, ikut_iuran, iuran_berhenti FROM warga WHERE id = ?', [id])).rows[0];
      if (!w) throw fail(404, 'Warga tidak ditemukan.');
      cekRtWarga(user, w.rt);
      const ctx = await bangunKonteks();
      const bulan = q.bulan ? String(q.bulan) : ctx.today.slice(0, 7);
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(bulan)) throw fail(400, 'Bulan tidak valid (format YYYY-MM).');
      const jumlah = Math.min(Math.max(Number(q.jumlah) || 3, 1), 6);
      const k = await bangunKalender(w, ctx, bulan, jumlah, { nominal: true });
      return { warga: { id: w.id, nama: w.nama, rt: w.rt, jenis: w.jenis }, ...k };
    }
  }
});
