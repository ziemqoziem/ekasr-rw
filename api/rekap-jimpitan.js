const db = require('./db');
const { route, scopeRt, butuh } = require('./_lib/http');
const P = require('./_lib/periode');
const L = require('./_lib/laporan');
const { basisAwal } = require('./_lib/kas');

const num = (v) => Number(v || 0);

/**
 * REKAP JIMPITAN per kumpulan RW (Selasa Kliwon, malam Rabu Legi).
 *   GET ?periode=YYYY-MM-DD   tanggal kumpulan (bawaan: kumpulan terdekat)
 * Rentang = sejak kumpulan sebelumnya (+1 hari) s.d. tanggal kumpulan (cut off); kumpulan ke-1 dihitung sejak tanggal saldo awal berlaku.
 * Isi: total, rincian per RT, rincian per warga (termasuk yang belum menyetor).
 */
module.exports = route({
  GET: {
    auth: butuh('jimpitan.lihat'),
    fn: async (req, res, user) => {
      const q = req.query || {};
      const today = P.todayWIB();
      const p = L.bacaPeriode(q.periode, today);
      const sampai = p.akhir < today ? p.akhir : today;
      const daftar = L.daftarPeriode(today);
      const nomor = daftar.find((x) => x.tanggal === p.tanggal);
      let dari = p.mulai;
      if (nomor && nomor.no === 1) {
        const basis = await basisAwal(sampai);
        if (basis) dari = basis.mulai;
      }
      const rt = scopeRt(user, null);
      const prm = [dari, sampai];
      if (rt) prm.push(rt);

      const r = await db.query(
        `SELECT w.id, w.nama, w.rt, w.jenis, w.aktif, COALESCE(s.c, 0) AS jumlah, COALESCE(s.n, 0) AS total
         FROM warga w
         LEFT JOIN (SELECT warga_id, COUNT(*) AS c, SUM(nominal) AS n FROM setoran
                    WHERE status = 'sah' AND tanggal BETWEEN ? AND ? GROUP BY warga_id) s ON s.warga_id = w.id
         WHERE ((w.aktif = 1 AND (w.ikut_jimpitan <> 0 OR w.jimpitan_berhenti IS NOT NULL)) OR COALESCE(s.n, 0) > 0)
         ${rt ? 'AND w.rt = ?' : ''}
         ORDER BY w.rt, w.nama`, prm);

      const warga = r.rows.map((x) => ({ id: x.id, nama: x.nama, rt: x.rt, jenis: x.jenis, jumlah: num(x.jumlah), total: num(x.total) }));
      const perRt = new Map();
      for (const w of warga) {
        if (!perRt.has(w.rt)) perRt.set(w.rt, { rt: w.rt, warga: 0, menyetor: 0, jumlah: 0, total: 0, pola: { harian: 0, mingguan: 0, bulanan: 0 } });
        const g = perRt.get(w.rt);
        g.warga += 1;
        if (w.total > 0) g.menyetor += 1;
        g.jumlah += w.jumlah;
        g.total += w.total;
        if (g.pola[w.jenis] !== undefined) g.pola[w.jenis] += w.total;
      }
      const rtList = [...perRt.values()].sort((a, b) => a.rt.localeCompare(b.rt));
      return {
        periode: { tanggal: p.tanggal, dari, sampai, no: nomor ? nomor.no : null, weton: nomor ? nomor.weton : '', berjalan: p.akhir >= today, hari_ini: p.akhir === today },
        daftar_periode: daftar,
        total: {
          total: rtList.reduce((a, g) => a + g.total, 0),
          jumlah: rtList.reduce((a, g) => a + g.jumlah, 0),
          warga: warga.length,
          menyetor: warga.filter((w) => w.total > 0).length,
          pola: ['harian', 'mingguan', 'bulanan'].reduce((o, k) => ({ ...o, [k]: rtList.reduce((a, g) => a + g.pola[k], 0) }), {})
        },
        rt: rtList,
        warga
      };
    }
  }
});
