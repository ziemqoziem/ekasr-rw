const db = require('./db');
const { route, scopeRt, butuh } = require('./_lib/http');
const { punya } = require('./_lib/izin');
const P = require('./_lib/periode');
const L = require('./_lib/laporan');
const { buatPdf } = require('./_lib/laporan-pdf');

/**
 * LAPORAN PER KUMPULAN RW (Selasa Kliwon, malam Rabu Legi). Tanpa rentang tanggal bebas.
 *   GET ?periode=YYYY-MM-DD (tanggal kumpulan)           laporan JSON satu kumpulan (bawaan: yang berjalan)
 *   GET ?periode=...&format=pdf        PDF untuk dibagikan ke warga
 *   GET ?periode=...&format=csv        CSV setoran jimpitan kumpulan itu
 * Isi mengikuti izin: kas.lihat → ringkasan kas, sewa, pengeluaran; jimpitan.lihat / iuran.lihat → status warga.
 * Peran yang dibatasi per RT hanya melihat data RT-nya (tanpa data kas).
 */
function csvCell(v) {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // cegah formula injection saat dibuka di Excel
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

module.exports = route({
  GET: {
    auth: butuh('laporan.lihat'),
    fn: async (req, res, user) => {
      const q = req.query || {};
      const today = P.todayWIB();
      const p = L.bacaPeriode(q.periode, today);
      const rt = scopeRt(user, null);
      const opsi = {
        rt,
        keuangan: punya(user, 'kas.lihat') && !rt,
        warga: punya(user, 'jimpitan.lihat') || punya(user, 'iuran.lihat')
      };

      if (q.format === 'csv') {
        const r = await db.query(
          `SELECT s.tanggal, w.nama, w.rt, s.tipe, s.periode_jenis, s.periode_kunci, s.nominal, s.metode, s.petugas, s.status, s.catatan
           FROM setoran s JOIN warga w ON w.id = s.warga_id
           WHERE s.tanggal BETWEEN ? AND ?${rt ? ' AND w.rt = ?' : ''} ORDER BY s.tanggal, w.rt, w.id`,
          rt ? [p.mulai, p.akhir, rt] : [p.mulai, p.akhir]);
        const lines = [['Tanggal', 'Nama', 'RT', 'Tipe', 'Jenis Periode', 'Periode', 'Nominal', 'Metode', 'Petugas', 'Status', 'Catatan'].join(',')];
        for (const x of r.rows) {
          lines.push([String(x.tanggal).slice(0, 10), x.nama, x.rt, x.tipe, x.periode_jenis, x.periode_kunci, x.nominal, x.metode, x.petugas, x.status, x.catatan].map(csvCell).join(','));
        }
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="setoran-kumpulan-${p.tanggal}.csv"`);
        res.status(200).send('﻿' + lines.join('\r\n'));
        return;
      }

      const laporan = await L.bangunLaporan(p, today, opsi);
      const ttd = await L.pengaturanLaporan();

      if (q.format === 'pdf') {
        res.status(200);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="laporan-kumpulan-${p.tanggal}.pdf"`);
        await new Promise((resolve, reject) => {
          res.on('finish', resolve);
          res.on('error', reject);
          buatPdf(laporan, ttd, res);
        });
        return;
      }

      return { laporan, daftar_periode: L.daftarPeriode(today), ttd, keuangan: opsi.keuangan, warga: opsi.warga };
    }
  }
});
