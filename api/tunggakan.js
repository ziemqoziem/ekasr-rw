const db = require('./db');
const { route, oneOf, scopeRt, RT_LIST, JENIS_LIST, butuh } = require('./_lib/http');
const { bangunKonteks, hitungSaldo } = require('./_lib/util');

/**
 * Tunggakan = kekurangan setelah JATUH TEMPO pola warga (harian: kemarin; mingguan: Minggu terakhir; bulanan: akhir bulan),
 * sudah memperhitungkan seluruh setoran dan titipan. Pembayaran menutup tunggakan lama lebih dulu.
 */
module.exports = route({
  GET: {
    auth: butuh('jimpitan.lihat'),
    fn: async (req, res, user) => {
      const q = req.query || {};
      const rt = scopeRt(user, q.rt ? oneOf(String(q.rt), 'RT', RT_LIST) : null);
      const jenis = q.jenis ? oneOf(String(q.jenis), 'Jenis', JENIS_LIST) : null;
      const semua = q.semua === '1';

      const where = ['aktif = 1'];
      const params = [];
      if (rt) { where.push('rt = ?'); params.push(rt); }
      if (jenis) { where.push('jenis = ?'); params.push(jenis); }
      if (q.q) { where.push('nama LIKE ?'); params.push(`%${String(q.q).slice(0, 60).replace(/[%_]/g, '')}%`); }
      const wr = await db.query(
        `SELECT id, nama, rt, jenis, no_hp, mulai_iuran, berhenti_pada, ikut_jimpitan, jimpitan_berhenti, ikut_iuran, iuran_berhenti FROM warga WHERE ${where.join(' AND ')} ORDER BY rt, id`,
        params
      );

      const ctx = await bangunKonteks();
      const saldo = hitungSaldo(wr.rows, ctx);
      const out = [];
      const ringkas = { warga_menunggak: 0, total_rutin: 0, total_lama: 0, total: 0, titipan: 0, warga_titipan: 0 };
      for (const w of wr.rows) {
        const s = saldo.get(w.id);
        if (s.lebih > 0) { ringkas.titipan += s.lebih; ringkas.warga_titipan += 1; }
        if (!semua && s.kurang === 0) continue;
        if (s.kurang > 0) {
          ringkas.warga_menunggak += 1;
          ringkas.total_rutin += s.berjalan_kurang;
          ringkas.total_lama += s.lama_sisa;
          ringkas.total += s.kurang;
        }
        out.push({
          id: w.id, nama: w.nama, rt: w.rt, jenis: w.jenis, no_hp: w.no_hp,
          kurang: s.kurang, hari_kurang: s.hari_kurang, berjalan_kurang: s.berjalan_kurang, lama_sisa: s.lama_sisa,
          tagihan_berjalan: s.tagihan_berjalan, lebih: s.lebih, lunas_sampai: s.lunas_sampai, jatuh_tempo: s.jatuh_tempo
        });
      }
      out.sort((a, b) => b.kurang - a.kurang);
      return { mulai_hitung: ctx.mulaiHitung, tarif_harian: ctx.tarifNow, ringkasan: ringkas, tunggakan: out };
    }
  }
});
