const db = require('./db');
const { route, fail, scopeRt, butuh } = require('./_lib/http');
const I = require('./_lib/iuran');
const P = require('./_lib/periode');

const num = (v) => Number(v || 0);

/**
 * REKAP IURAN WAJIB per kumpulan RW.
 *   GET ?periode=YYYY-MM-DD   tanggal mulai periode/kumpulan (bawaan: periode berjalan)
 * Isi: total pemasukan iuran bertanggal di periode itu, rincian per RT, rincian per warga.
 */
module.exports = route({
  GET: {
    auth: butuh('iuran.lihat'),
    fn: async (req, res, user) => {
      const q = req.query || {};
      const ctx = await I.bangunKonteksIuran();
      const sekarang = I.periodeDari(ctx.today);
      let periode = sekarang;
      if (q.periode) {
        if (!P.validDate(String(q.periode))) throw fail(400, 'Periode tidak valid.');
        periode = I.periodeDari(String(q.periode));
        if (periode.mulai > sekarang.mulai) periode = sekarang;
      }
      const awalTagih = ctx.iuranMulai ? I.periodePertama(ctx.iuranMulai).mulai : null;
      const urut = [];
      for (let p = sekarang; urut.length < 60; p = I.periodeSebelum(p)) {
        if (awalTagih && p.mulai < awalTagih && urut.length >= 3) break;
        urut.unshift(p);
        if (!awalTagih && urut.length >= 8) break;
      }
      const daftar = urut.map((p, i) => ({ mulai: p.mulai, akhir: p.akhir, no: i + 1, weton: I.weton(p.mulai), berjalan: p.mulai === sekarang.mulai })).reverse();
      const nomor = daftar.find((x) => x.mulai === periode.mulai);
      const sampai = periode.akhir < ctx.today ? periode.akhir : ctx.today;
      const info = { mulai: periode.mulai, akhir: periode.akhir, sampai, no: nomor ? nomor.no : null, weton: I.weton(periode.mulai), berjalan: periode.mulai === sekarang.mulai };
      if (!ctx.aktif) return { aktif: false, periode: info, daftar_periode: daftar, total: { total: 0, warga: 0, menyetor: 0 }, rt: [], warga: [] };

      const rt = scopeRt(user, null);
      const prm = [periode.mulai, periode.akhir];
      if (rt) prm.push(rt);
      const r = await db.query(
        `SELECT w.id, w.nama, w.rt, COALESCE(s.n, 0) AS total
         FROM warga w
         LEFT JOIN (SELECT warga_id, SUM(nominal) AS n FROM iuran_wajib
                    WHERE status = 'sah' AND tanggal BETWEEN ? AND ? GROUP BY warga_id) s ON s.warga_id = w.id
         WHERE ((w.aktif = 1 AND (w.ikut_iuran = 1 OR w.iuran_berhenti IS NOT NULL)) OR COALESCE(s.n, 0) > 0)
         ${rt ? 'AND w.rt = ?' : ''}
         ORDER BY w.rt, w.nama`, prm);
      const warga = r.rows.map((x) => ({ id: x.id, nama: x.nama, rt: x.rt, total: num(x.total) }));
      const perRt = new Map();
      for (const w of warga) {
        if (!perRt.has(w.rt)) perRt.set(w.rt, { rt: w.rt, warga: 0, menyetor: 0, total: 0 });
        const g = perRt.get(w.rt);
        g.warga += 1;
        if (w.total > 0) g.menyetor += 1;
        g.total += w.total;
      }
      const rtList = [...perRt.values()].sort((a, b) => a.rt.localeCompare(b.rt));
      return {
        aktif: true, periode: info, daftar_periode: daftar,
        total: { total: rtList.reduce((a, g) => a + g.total, 0), warga: warga.length, menyetor: warga.filter((w) => w.total > 0).length },
        rt: rtList, warga
      };
    }
  }
});
