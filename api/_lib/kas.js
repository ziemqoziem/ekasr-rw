const db = require('../db');
const num = (v) => Number(v || 0);
const d10 = (v) => String(v).slice(0, 10);

const P = require('./periode');
const KANTONG = ['jimpitan', 'iuran_wajib', 'sewa_aset', 'umum'];

/**
 * Basis saldo awal untuk tanggal D: saldo_awal tahun Y terbaru yang berlaku (saldo per 31 Des Y-1, mulai 1 Jan Y)
 * dengan Y-01-01 <= D+1. Tanpa saldo awal → null (hitung dari seluruh transaksi).
 */
async function basisAwal(sampai) {
  const r = await db.query('SELECT tahun, sumber, nominal FROM saldo_awal');
  if (!r.rows.length) return null;
  const batas = sampai ? P.addDays(sampai, 1) : '9999-12-31';
  let pilih = null;
  for (const x of r.rows) {
    if (`${x.tahun}-01-01` <= batas && (pilih === null || x.tahun > pilih)) pilih = Number(x.tahun);
  }
  if (pilih === null) return null;
  const awal = { jimpitan: 0, iuran_wajib: 0, sewa_aset: 0, umum: 0 };
  for (const x of r.rows) if (Number(x.tahun) === pilih) awal[x.sumber] = num(x.nominal);
  return { tahun: pilih, mulai: `${pilih}-01-01`, awal };
}

/**
 * Saldo kas per KANTONG sampai tanggal tertentu (inklusif):
 *   saldo sumber = saldo awal + pemasukan sumber − pengeluaran berlabel sumber itu
 *   umum         = saldo awal umum (≤ 0) − pengeluaran tanpa label
 *   total        = jumlah semua kantong
 * Hanya transaksi sejak tanggal saldo awal (1 Jan tahun basis) yang dihitung; sebelum itu sudah termasuk saldo awal.
 */
async function totalKas(sampai) {
  const basis = await basisAwal(sampai);
  const w = [];
  const p = [];
  if (basis) { w.push('tanggal >= ?'); p.push(basis.mulai); }
  if (sampai) { w.push('tanggal <= ?'); p.push(sampai); }
  const where = w.length ? ' AND ' + w.join(' AND ') : '';
  const masuk = async (tabel) => num((await db.query(`SELECT COALESCE(SUM(nominal), 0) AS n FROM ${tabel} WHERE status = 'sah'${where}`, p)).rows[0].n);
  const trx = { jimpitan: await masuk('setoran'), iuran_wajib: await masuk('iuran_wajib'), sewa_aset: await masuk('sewa_aset') };
  const kel = { jimpitan: 0, iuran_wajib: 0, sewa_aset: 0, umum: 0 };
  const kr = await db.query(`SELECT sumber, COALESCE(SUM(nominal), 0) AS n FROM pengeluaran WHERE status = 'sah'${where} GROUP BY sumber`, p);
  for (const x of kr.rows) kel[x.sumber] = num(x.n);
  const awal = basis ? basis.awal : { jimpitan: 0, iuran_wajib: 0, sewa_aset: 0, umum: 0 };
  const saldo = {
    jimpitan: awal.jimpitan + trx.jimpitan - kel.jimpitan,
    iuran: awal.iuran_wajib + trx.iuran_wajib - kel.iuran_wajib,
    sewa: awal.sewa_aset + trx.sewa_aset - kel.sewa_aset,
    umum: awal.umum - kel.umum
  };
  const masukTotal = awal.jimpitan + awal.iuran_wajib + awal.sewa_aset + trx.jimpitan + trx.iuran_wajib + trx.sewa_aset;
  const keluarTotal = kel.jimpitan + kel.iuran_wajib + kel.sewa_aset + kel.umum - awal.umum;
  return {
    ...saldo,
    masuk: masukTotal, keluar: keluarTotal,
    saldo: saldo.jimpitan + saldo.iuran + saldo.sewa + saldo.umum,
    awal: { ...awal }, trx, keluar_sumber: kel, tahun_basis: basis ? basis.tahun : null
  };
}

/** Total pada rentang tanggal [dari, sampai] */
async function totalRentang(dari, sampai) {
  const one = async (tabel) => num((await db.query(
    `SELECT COALESCE(SUM(nominal), 0) AS n FROM ${tabel} WHERE status = 'sah' AND tanggal BETWEEN ? AND ?`, [dari, sampai]
  )).rows[0].n);
  const jimpitan = await one('setoran');
  const iuran = await one('iuran_wajib');
  const sewa = await one('sewa_aset');
  const keluar = await one('pengeluaran');
  return { jimpitan, iuran, sewa, masuk: jimpitan + iuran + sewa, keluar, selisih: jimpitan + iuran + sewa - keluar };
}

/** Buku kas gabungan (kronologis, saldo berjalan). Jimpitan & iuran wajib diringkas per tanggal. */
async function bukuKas(dari, sampai, sumber) {
  const baris = [];
  const ambil = (s) => !sumber || sumber === s;
  if (ambil('jimpitan')) {
    const r = await db.query("SELECT tanggal, COUNT(*) AS c, SUM(nominal) AS n FROM setoran WHERE status = 'sah' AND tanggal BETWEEN ? AND ? GROUP BY tanggal", [dari, sampai]);
    for (const x of r.rows) baris.push({ tanggal: d10(x.tanggal), sumber: 'jimpitan', uraian: `Jimpitan warga (${x.c} setoran)`, masuk: num(x.n), keluar: 0 });
  }
  if (ambil('iuran_wajib')) {
    const r = await db.query("SELECT tanggal, COUNT(*) AS c, SUM(nominal) AS n FROM iuran_wajib WHERE status = 'sah' AND tanggal BETWEEN ? AND ? GROUP BY tanggal", [dari, sampai]);
    for (const x of r.rows) baris.push({ tanggal: d10(x.tanggal), sumber: 'iuran_wajib', uraian: `Iuran wajib warga (${x.c} pembayaran)`, masuk: num(x.n), keluar: 0 });
  }
  if (ambil('sewa_aset')) {
    const r = await db.query("SELECT tanggal, rt, uraian, nominal FROM sewa_aset WHERE status = 'sah' AND tanggal BETWEEN ? AND ?", [dari, sampai]);
    for (const x of r.rows) baris.push({ tanggal: d10(x.tanggal), sumber: 'sewa_aset', uraian: `Pemasukan lainnya: ${x.uraian}${x.rt ? ' (RT ' + x.rt + ')' : ''}`, masuk: num(x.nominal), keluar: 0 });
  }
  if (ambil('pengeluaran')) {
    const r = await db.query("SELECT tanggal, kategori, uraian, nominal FROM pengeluaran WHERE status = 'sah' AND tanggal BETWEEN ? AND ?", [dari, sampai]);
    for (const x of r.rows) baris.push({ tanggal: d10(x.tanggal), sumber: 'pengeluaran', uraian: `${x.uraian} (${x.kategori})`, masuk: 0, keluar: num(x.nominal) });
  }
  const urut = { jimpitan: 1, iuran_wajib: 2, sewa_aset: 3, pengeluaran: 4 };
  baris.sort((a, b) => a.tanggal.localeCompare(b.tanggal) || urut[a.sumber] - urut[b.sumber]);
  return baris;
}

module.exports = { basisAwal, totalKas, totalRentang, bukuKas };
