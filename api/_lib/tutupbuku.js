const db = require('../db');
const { fail } = require('./http');

/** Tahun-tahun yang sudah ditutup bukunya (urut naik) */
async function tahunDitutup() {
  const r = await db.query('SELECT tahun FROM tutup_buku ORDER BY tahun ASC');
  return r.rows.map((x) => Number(x.tahun));
}

/** Tanggal terakhir yang terkunci (31 Des tahun terakhir yang ditutup), atau null */
async function tanggalKunci() {
  const t = await tahunDitutup();
  return t.length ? `${t[t.length - 1]}-12-31` : null;
}

/** Tolak transaksi/pembatalan yang bertanggal pada buku yang sudah ditutup */
async function pastikanTerbuka(tanggal) {
  const kunci = await tanggalKunci();
  if (kunci && String(tanggal).slice(0, 10) <= kunci) {
    throw fail(400, `Buku tahun ${kunci.slice(0, 4)} sudah ditutup; transaksi bertanggal ${String(tanggal).slice(0, 10)} tidak dapat dicatat atau dibatalkan. Hubungi admin bila perlu membuka kembali.`);
  }
}

module.exports = { tahunDitutup, tanggalKunci, pastikanTerbuka };
