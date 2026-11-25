const db = require('../db');
const { fail } = require('./http');
const { newId, bangunKonteks, hitungSaldo } = require('./util');
const { pastikanTerbuka } = require('./tutupbuku');
const { invalidatePublik } = require('./cache-publik');

const METODE = ['tunai', 'transfer'];
const MAKS_DB = 2000000000; // batas kolom INT; tidak ada batas bisnis

/**
 * Simpan satu setoran dengan nominal BEBAS (tanpa periode). Saldo warga dihitung dari total setoran.
 * Bila sudah ada setoran sah dengan warga + tanggal + nominal yang sama, minta konfirmasi (kode DUPLIKAT).
 */
async function simpanSetoran({ user, warga, tanggal, nominal, metode, catatan, abaikanDuplikat }) {
  const nom = Number(nominal);
  if (!Number.isInteger(nom) || nom <= 0 || nom > MAKS_DB) throw fail(400, 'Nominal harus bilangan bulat lebih dari 0.');
  await pastikanTerbuka(tanggal);
  if (!abaikanDuplikat) {
    const d = await db.query(
      "SELECT id FROM setoran WHERE warga_id = ? AND tanggal = ? AND nominal = ? AND status = 'sah' LIMIT 1",
      [warga.id, tanggal, nom]
    );
    if (d.rows.length) {
      const e = fail(409, `${warga.nama}: sudah ada setoran Rp ${nom.toLocaleString('id-ID')} pada tanggal ini. Yakin menambah lagi?`);
      e.kode = 'DUPLIKAT';
      throw e;
    }
  }
  const id = newId('STR');
  await db.query(
    `INSERT INTO setoran (id, warga_id, tanggal, tipe, nominal, metode, petugas, catatan)
     VALUES (?, ?, ?, 'rutin', ?, ?, ?, ?)`,
    [id, warga.id, tanggal, nom, METODE.includes(metode) ? metode : 'tunai', user.username, catatan || null]
  );
  invalidatePublik();
  return { id, nominal: nom };
}

// Ringkasan saldo satu warga (setelah/ sebelum setoran)
async function ringkasanSaldo(warga, ctxIn) {
  const ctx = ctxIn || (await bangunKonteks());
  const s = hitungSaldo([warga], ctx).get(warga.id);
  return {
    saldo: s.saldo, lebih: s.lebih, kurang: s.kurang, tagihan_berjalan: s.tagihan_berjalan,
    hari_tertutup: s.hari_tertutup, hari_kurang: s.hari_kurang, lunas_sampai: s.lunas_sampai,
    lama_sisa: s.lama_sisa, berjalan_kurang: s.berjalan_kurang
  };
}

module.exports = { simpanSetoran, ringkasanSaldo, METODE };
