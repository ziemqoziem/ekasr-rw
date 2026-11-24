const db = require('./db');
const { route, fail, oneOf, scopeRt, RT_LIST, JENIS_LIST, butuh } = require('./_lib/http');
const { bangunKonteks, hitungSaldo } = require('./_lib/util');
const P = require('./_lib/periode');

/**
 * Papan setoran untuk satu tanggal: warga aktif beserta SALDO-nya (kurang / titipan / lunas sampai),
 * setoran yang sudah tercatat pada tanggal itu, dan SARAN nominal (bukan kewajiban — nominal diisi manual).
 */
module.exports = route({
  GET: {
    auth: butuh('jimpitan.lihat'),
    fn: async (req, res, user) => {
      const q = req.query || {};
      const tanggal = q.tanggal ? String(q.tanggal) : P.todayWIB();
      if (!P.validDate(tanggal)) throw fail(400, 'Tanggal tidak valid.');
      const rt = scopeRt(user, q.rt ? oneOf(String(q.rt), 'RT', RT_LIST) : null);
      const jenis = q.jenis ? oneOf(String(q.jenis), 'Jenis', JENIS_LIST) : null;

      const where = ['aktif = 1', '(ikut_jimpitan = 1 OR jimpitan_berhenti IS NOT NULL)'];
      const params = [];
      if (rt) { where.push('rt = ?'); params.push(rt); }
      if (jenis) { where.push('jenis = ?'); params.push(jenis); }
      const wr = await db.query(
        `SELECT id, nama, rt, jenis, no_hp, mulai_iuran, berhenti_pada, ikut_jimpitan, jimpitan_berhenti, ikut_iuran, iuran_berhenti FROM warga WHERE ${where.join(' AND ')} ORDER BY rt, id`,
        params
      );

      const ctx = await bangunKonteks();
      const saldo = hitungSaldo(wr.rows, ctx);
      const sr = await db.query("SELECT id, warga_id, nominal FROM setoran WHERE status = 'sah' AND tanggal = ?", [tanggal]);
      const hari = new Map();
      for (const s of sr.rows) {
        if (!hari.has(s.warga_id)) hari.set(s.warga_id, []);
        hari.get(s.warga_id).push({ id: s.id, nominal: s.nominal });
      }
      const hariBulan = Number(P.rangeOf('bulanan', ctx.today.slice(0, 7))[1].slice(8));
      const polaNominal = { harian: ctx.tarifNow, mingguan: ctx.tarifNow * 7, bulanan: ctx.tarifNow * hariBulan };

      let sudah = 0, totalMasuk = 0, totalKurang = 0;
      const rows = wr.rows.map((w) => {
        const s = saldo.get(w.id);
        const list = hari.get(w.id) || [];
        const totalHari = list.reduce((a, x) => a + x.nominal, 0);
        if (list.length) sudah += 1;
        totalMasuk += totalHari;
        totalKurang += s.kurang;
        return {
          id: w.id, nama: w.nama, rt: w.rt, jenis: w.jenis, no_hp: w.no_hp,
          kurang: s.kurang, tagihan_berjalan: s.tagihan_berjalan, lebih: s.lebih, hari_tertutup: s.hari_tertutup, lunas_sampai: s.lunas_sampai,
          saran: s.tagihan_berjalan > 0 ? s.tagihan_berjalan : polaNominal[w.jenis],
          setoran: list, total_hari: totalHari
        };
      });
      return {
        tanggal, tarif_harian: ctx.tarifNow,
        ringkasan: { total_warga: rows.length, sudah_setor: sudah, belum: rows.length - sudah, total_masuk: totalMasuk, total_kurang: totalKurang },
        warga: rows
      };
    }
  }
});
