const db = require('../db');
const num = (v) => Number(v || 0);
const d10 = (v) => String(v).slice(0, 10);

const P = require('./periode');
const KANTONG = ['jimpitan', 'iuran_wajib', 'sewa_aset', 'umum'];

/** Cache ringan untuk satu request (hindari totalKas/totalRentang berulang di loop periode). */
function createKasMemo() {
  const kas = new Map();
  const rentang = new Map();
  let saldoAwalRows = null;
  return {
    async basisAwal(sampai) {
      if (!saldoAwalRows) {
        const r = await db.query('SELECT tahun, sumber, nominal FROM saldo_awal');
        saldoAwalRows = r.rows;
      }
      return basisDariRows(saldoAwalRows, sampai);
    },
    async totalKas(sampai) {
      const key = sampai || '';
      if (kas.has(key)) return kas.get(key);
      const basis = await this.basisAwal(sampai);
      const v = await totalKasDariBasis(basis, sampai);
      kas.set(key, v);
      return v;
    },
    async totalRentang(dari, sampai) {
      const key = `${dari}|${sampai}`;
      if (rentang.has(key)) return rentang.get(key);
      const v = await totalRentangImpl(dari, sampai);
      rentang.set(key, v);
      return v;
    }
  };
}

/**
 * Basis saldo awal untuk tanggal D: saldo_awal tahun Y terbaru yang berlaku (saldo per 31 Des Y-1, mulai 1 Jan Y)
 * dengan Y-01-01 <= D+1. Tanpa saldo awal → null (hitung dari seluruh transaksi).
 */
function basisDariRows(rows, sampai) {
  if (!rows || !rows.length) return null;
  const batas = sampai ? P.addDays(sampai, 1) : '9999-12-31';
  let pilih = null;
  for (const x of rows) {
    if (`${x.tahun}-01-01` <= batas && (pilih === null || x.tahun > pilih)) pilih = Number(x.tahun);
  }
  if (pilih === null) return null;
  const awal = { jimpitan: 0, iuran_wajib: 0, sewa_aset: 0, umum: 0 };
  for (const x of rows) if (Number(x.tahun) === pilih) awal[x.sumber] = num(x.nominal);
  return { tahun: pilih, mulai: `${pilih}-01-01`, awal };
}

async function basisAwal(sampai) {
  const r = await db.query('SELECT tahun, sumber, nominal FROM saldo_awal');
  return basisDariRows(r.rows, sampai);
}

async function totalKasDariBasis(basis, sampai) {
  const w = [];
  const p = [];
  if (basis) { w.push('tanggal >= ?'); p.push(basis.mulai); }
  if (sampai) { w.push('tanggal <= ?'); p.push(sampai); }
  const where = w.length ? ' AND ' + w.join(' AND ') : '';
  const masukSql = (tabel) =>
    db.query(`SELECT COALESCE(SUM(nominal), 0) AS n FROM ${tabel} WHERE status = 'sah'${where}`, p);
  const [jimpitanR, iuranR, sewaR, kr] = await Promise.all([
    masukSql('setoran'),
    masukSql('iuran_wajib'),
    masukSql('sewa_aset'),
    db.query(`SELECT sumber, COALESCE(SUM(nominal), 0) AS n FROM pengeluaran WHERE status = 'sah'${where} GROUP BY sumber`, p)
  ]);
  const trx = { jimpitan: num(jimpitanR.rows[0].n), iuran_wajib: num(iuranR.rows[0].n), sewa_aset: num(sewaR.rows[0].n) };
  const kel = { jimpitan: 0, iuran_wajib: 0, sewa_aset: 0, umum: 0 };
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

/**
 * Saldo kas per KANTONG sampai tanggal tertentu (inklusif).
 */
async function totalKas(sampai) {
  const basis = await basisAwal(sampai);
  return totalKasDariBasis(basis, sampai);
}

/** Total pada rentang tanggal [dari, sampai] — 1 round-trip (UNION ALL). */
async function totalRentangImpl(dari, sampai) {
  const r = await db.query(
    `SELECT 'jimpitan' AS src, COALESCE(SUM(nominal), 0) AS n FROM setoran WHERE status = 'sah' AND tanggal BETWEEN ? AND ?
     UNION ALL
     SELECT 'iuran', COALESCE(SUM(nominal), 0) FROM iuran_wajib WHERE status = 'sah' AND tanggal BETWEEN ? AND ?
     UNION ALL
     SELECT 'sewa', COALESCE(SUM(nominal), 0) FROM sewa_aset WHERE status = 'sah' AND tanggal BETWEEN ? AND ?
     UNION ALL
     SELECT 'keluar', COALESCE(SUM(nominal), 0) FROM pengeluaran WHERE status = 'sah' AND tanggal BETWEEN ? AND ?`,
    [dari, sampai, dari, sampai, dari, sampai, dari, sampai]
  );
  const m = Object.fromEntries(r.rows.map((x) => [x.src, num(x.n)]));
  const jimpitan = m.jimpitan || 0;
  const iuran = m.iuran || 0;
  const sewa = m.sewa || 0;
  const keluar = m.keluar || 0;
  return { jimpitan, iuran, sewa, masuk: jimpitan + iuran + sewa, keluar, selisih: jimpitan + iuran + sewa - keluar };
}

async function totalRentang(dari, sampai) {
  return totalRentangImpl(dari, sampai);
}

/** Buku kas gabungan (kronologis, saldo berjalan). Jimpitan & iuran wajib diringkas per tanggal. */
async function bukuKas(dari, sampai, sumber) {
  const baris = [];
  const ambil = (s) => !sumber || sumber === s;
  const jobs = [];
  if (ambil('jimpitan')) {
    jobs.push(db.query("SELECT tanggal, COUNT(*) AS c, SUM(nominal) AS n FROM setoran WHERE status = 'sah' AND tanggal BETWEEN ? AND ? GROUP BY tanggal", [dari, sampai])
      .then((r) => { for (const x of r.rows) baris.push({ tanggal: d10(x.tanggal), sumber: 'jimpitan', uraian: `Jimpitan warga (${x.c} setoran)`, masuk: num(x.n), keluar: 0 }); }));
  }
  if (ambil('iuran_wajib')) {
    jobs.push(db.query("SELECT tanggal, COUNT(*) AS c, SUM(nominal) AS n FROM iuran_wajib WHERE status = 'sah' AND tanggal BETWEEN ? AND ? GROUP BY tanggal", [dari, sampai])
      .then((r) => { for (const x of r.rows) baris.push({ tanggal: d10(x.tanggal), sumber: 'iuran_wajib', uraian: `Iuran wajib warga (${x.c} pembayaran)`, masuk: num(x.n), keluar: 0 }); }));
  }
  if (ambil('sewa_aset')) {
    jobs.push(db.query("SELECT tanggal, rt, uraian, nominal FROM sewa_aset WHERE status = 'sah' AND tanggal BETWEEN ? AND ?", [dari, sampai])
      .then((r) => { for (const x of r.rows) baris.push({ tanggal: d10(x.tanggal), sumber: 'sewa_aset', uraian: `Pemasukan lainnya: ${x.uraian}${x.rt ? ' (RT ' + x.rt + ')' : ''}`, masuk: num(x.nominal), keluar: 0 }); }));
  }
  if (ambil('pengeluaran')) {
    jobs.push(db.query("SELECT tanggal, kategori, uraian, nominal FROM pengeluaran WHERE status = 'sah' AND tanggal BETWEEN ? AND ?", [dari, sampai])
      .then((r) => { for (const x of r.rows) baris.push({ tanggal: d10(x.tanggal), sumber: 'pengeluaran', uraian: `${x.uraian} (${x.kategori})`, masuk: 0, keluar: num(x.nominal) }); }));
  }
  await Promise.all(jobs);
  const urut = { jimpitan: 1, iuran_wajib: 2, sewa_aset: 3, pengeluaran: 4 };
  baris.sort((a, b) => a.tanggal.localeCompare(b.tanggal) || urut[a.sumber] - urut[b.sumber]);
  return baris;
}

module.exports = { basisAwal, totalKas, totalRentang, bukuKas, createKasMemo, KANTONG };
