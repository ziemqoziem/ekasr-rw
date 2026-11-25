/**
 * Migrasi ke E-Kas (iuran wajib per Rabu Legi, sewa aset, role baru).
 *   npm run migrasi-ekas
 *
 * Aman dijalankan berulang (idempoten). TIDAK menyentuh data setoran/warga/tunggakan_lama/tarif jimpitan.
 *   1) role pengguna: kolom menjadi VARCHAR; bendahara → bendahara_rw, petugas → bendahara_jimpitan
 *   2) membuat tabel tarif_iuran, iuran_wajib, sewa_aset, saldo_awal, tutup_buku, peran, peran_izin; pengeluaran.sumber;
 *      kolom warga ikut_jimpitan/ikut_iuran (+ tanggal berhenti); isi hak akses bawaan
 *   3) nama_web / subjudul diganti ke brand E-Kas bila masih nilai bawaan lama
 *
 * WAJIB cadangkan database lebih dulu:  mysqldump -u <user> -p webrw3 > cadangan.sql
 */
const fs = require('fs');
const path = require('path');
const { loadEnv } = require('../api/_lib/env');
loadEnv();
const mysql = require('mysql2/promise');

const DB_NAME = process.env.DB_NAME || 'webrw3';
const cfg = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: DB_NAME,
  multipleStatements: false
};
if (process.env.DB_SOCKET) { cfg.socketPath = process.env.DB_SOCKET; delete cfg.host; delete cfg.port; }

(async () => {
  const db = await mysql.createConnection(cfg);
  const log = [];

  // 1) Role: kolom pengguna.role → VARCHAR(40) (peran dapat dibuat admin); petakan nama peran lama
  const [[col]] = await db.query(
    "SELECT DATA_TYPE AS t FROM information_schema.columns WHERE table_schema = ? AND table_name = 'pengguna' AND column_name = 'role'", [DB_NAME]
  );
  if (String(col.t).toLowerCase() === 'enum') {
    await db.query("ALTER TABLE pengguna MODIFY role VARCHAR(40) NOT NULL DEFAULT 'bendahara_jimpitan'");
    log.push('kolom pengguna.role diubah menjadi VARCHAR(40)');
  }
  const [a1] = await db.query("UPDATE pengguna SET role = 'bendahara_rw' WHERE role = 'bendahara'");
  const [b1] = await db.query("UPDATE pengguna SET role = 'bendahara_jimpitan' WHERE role = 'petugas'");
  if (a1.affectedRows || b1.affectedRows) log.push(`role dipetakan (bendahara→bendahara_rw: ${a1.affectedRows}, petugas→bendahara_jimpitan: ${b1.affectedRows})`);

  // 2) Tabel baru dari schema.sql (CREATE TABLE IF NOT EXISTS) — hanya tabel E-Kas
  const schema = fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8')
    .split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
  const baru = ['tarif_iuran', 'iuran_wajib', 'sewa_aset', 'saldo_awal', 'tutup_buku', 'peran', 'peran_izin'];
  for (const stmt of schema.split(';').map((s) => s.trim()).filter(Boolean)) {
    const m = /CREATE TABLE IF NOT EXISTS\s+(\w+)/i.exec(stmt);
    if (m && baru.includes(m[1])) {
      const [ada] = await db.query('SELECT 1 FROM information_schema.tables WHERE table_schema = ? AND table_name = ?', [DB_NAME, m[1]]);
      if (!ada.length) { await db.query(stmt); log.push(`tabel ${m[1]} dibuat`); }
    }
  }

  // 2b) pengeluaran.sumber (label kantong dana; data lama = 'umum')
  const [kolSumber] = await db.query(
    "SELECT 1 FROM information_schema.columns WHERE table_schema = ? AND table_name = 'pengeluaran' AND column_name = 'sumber'", [DB_NAME]);
  if (!kolSumber.length) {
    await db.query("ALTER TABLE pengeluaran ADD COLUMN sumber ENUM('umum','jimpitan','iuran_wajib','sewa_aset') NOT NULL DEFAULT 'umum' AFTER bukti");
    log.push('kolom pengeluaran.sumber ditambahkan (data lama = umum)');
  }

  // 2b2) peran.batas_rt (harus ada sebelum mengisi peran bawaan)
  const [kolB] = await db.query("SELECT 1 FROM information_schema.columns WHERE table_schema = ? AND table_name = 'peran' AND column_name = 'batas_rt'", [DB_NAME]);
  if (!kolB.length) { await db.query('ALTER TABLE peran ADD COLUMN batas_rt TINYINT(1) NOT NULL DEFAULT 0 AFTER sistem'); log.push('kolom peran.batas_rt ditambahkan'); }

  const [kolD] = await db.query("SELECT 1 FROM information_schema.columns WHERE table_schema = ? AND table_name = 'peran' AND column_name = 'dana_pengeluaran'", [DB_NAME]);
  if (!kolD.length) { await db.query("ALTER TABLE peran ADD COLUMN dana_pengeluaran VARCHAR(20) NOT NULL DEFAULT 'umum' AFTER batas_rt"); log.push('kolom peran.dana_pengeluaran ditambahkan'); }

  // 2c) Hak akses peran bawaan (hanya bila belum ada; tidak menimpa pengaturan admin)
  const { BAWAAN } = require('../api/_lib/izin');
  for (const [kode, v] of Object.entries(BAWAAN)) {
    const [r] = await db.query('INSERT IGNORE INTO peran (kode, nama, keterangan, sistem, batas_rt, dana_pengeluaran) VALUES (?, ?, ?, 1, ?, ?)', [kode, v.nama, v.keterangan, v.batas_rt || 0, v.dana_pengeluaran || 'umum']);
    if (r.affectedRows) {
      for (const i of v.izin) await db.query('INSERT IGNORE INTO peran_izin (peran, izin) VALUES (?, ?)', [kode, i]);
      log.push(`peran ${kode} diisi hak akses bawaan`);
    }
  }

  // 2e) Revisi peran (sekali): admin = semua menu; hanya admin mengakses Pengaturan & Warga; sewa dicatat Bendahara RW
  const [sudahV2] = await db.query("SELECT 1 FROM pengaturan WHERE kunci = 'migrasi_peran_v2'");
  if (!sudahV2.length) {
    const { ADMIN_WAJIB } = require('../api/_lib/izin');
    const cabut = [['bendahara_rw', 'warga.lihat'], ['bendahara_jimpitan', 'warga.lihat'], ['bendahara_jimpitan', 'saldoawal.kelola'], ['pengurus_rt', 'sewa.tulis'], ['pengurus_rt', 'sewa.semua_rt']];
    for (const [pr, iz] of cabut) await db.query('DELETE FROM peran_izin WHERE peran = ? AND izin = ?', [pr, iz]);
    for (const iz of ADMIN_WAJIB) await db.query('INSERT IGNORE INTO peran_izin (peran, izin) VALUES (?, ?)', ['admin', iz]);
    await db.query("INSERT INTO pengaturan (kunci, nilai) VALUES ('migrasi_peran_v2', '1')");
    log.push('hak akses peran direvisi (admin semua menu; Warga & Pengaturan khusus admin; sewa dicatat Bendahara RW)');
  }

  // 2f) Peran: kolom batas_rt + revisi v3 (iuran wajib dicatat Pengurus RT di RT-nya; sewa & pengeluaran Bendahara RW)
  const [sudahV3] = await db.query("SELECT 1 FROM pengaturan WHERE kunci = 'migrasi_peran_v3'");
  if (!sudahV3.length) {
    await db.query("DELETE FROM peran_izin WHERE izin = 'sewa.semua_rt'");
    await db.query("DELETE FROM peran_izin WHERE peran = 'bendahara_rw' AND izin = 'iuran.tulis'");
    await db.query("DELETE FROM peran_izin WHERE peran = 'pengurus_rt'");
    for (const iz of ['iuran.lihat', 'iuran.tulis', 'warga.lihat']) await db.query("INSERT IGNORE INTO peran_izin (peran, izin) VALUES ('pengurus_rt', ?)", [iz]);
    await db.query("UPDATE peran SET batas_rt = 1, keterangan = 'Mencatat iuran wajib & melihat warga di RT-nya saja' WHERE kode = 'pengurus_rt'");
    await db.query("INSERT INTO pengaturan (kunci, nilai) VALUES ('migrasi_peran_v3', '1')");
    log.push('hak akses peran direvisi v3 (iuran wajib → Pengurus RT di RT-nya; Bendahara RW: sewa & pengeluaran)');
  }

  // 2g) Revisi v4 (sekali): pengeluaran juga dicatat Bendahara Jimpitan (dana jimpitan); Bendahara RW otomatis dari dana iuran wajib
  const [sudahV4] = await db.query("SELECT 1 FROM pengaturan WHERE kunci = 'migrasi_peran_v4'");
  if (!sudahV4.length) {
    for (const iz of ['pengeluaran.lihat', 'pengeluaran.tulis']) await db.query("INSERT IGNORE INTO peran_izin (peran, izin) VALUES ('bendahara_jimpitan', ?)", [iz]);
    await db.query("UPDATE peran SET dana_pengeluaran = 'jimpitan' WHERE kode = 'bendahara_jimpitan'");
    await db.query("UPDATE peran SET dana_pengeluaran = 'iuran_wajib' WHERE kode = 'bendahara_rw'");
    await db.query("INSERT INTO pengaturan (kunci, nilai) VALUES ('migrasi_peran_v4', '1')");
    log.push('revisi v4: Bendahara Jimpitan mencatat pengeluaran dari dana jimpitan; Bendahara RW dari dana iuran wajib');
  }

  // 2h) Revisi v5: Pengurus RT juga melihat dashboard (beranda lengkap, dibatasi RT); setelah login semua peran ke beranda
  const [sudahV5] = await db.query("SELECT 1 FROM pengaturan WHERE kunci = 'migrasi_peran_v5'");
  if (!sudahV5.length) {
    await db.query("INSERT IGNORE INTO peran_izin (peran, izin) VALUES ('pengurus_rt', 'dashboard.lihat')");
    for (const peran of ['bendahara_rw', 'bendahara_jimpitan']) {
      await db.query("INSERT IGNORE INTO peran_izin (peran, izin) VALUES (?, 'dashboard.lihat')", [peran]);
    }
    await db.query("UPDATE peran SET keterangan = 'Mencatat iuran wajib & melihat warga di RT-nya saja; melihat dashboard RT' WHERE kode = 'pengurus_rt'");
    await db.query("INSERT INTO pengaturan (kunci, nilai) VALUES ('migrasi_peran_v5', '1')");
    log.push('revisi v5: Pengurus RT + bendahara mendapat dashboard.lihat (halaman awal setelah login)');
  }

  // 2d) Warga: pilihan program iuran (jimpitan / iuran kas); semua warga bawaan wajib keduanya
  const kolW = [['ikut_jimpitan', 'TINYINT(1) NOT NULL DEFAULT 1'], ['jimpitan_berhenti', 'DATE NULL'], ['ikut_iuran', 'TINYINT(1) NOT NULL DEFAULT 1'], ['iuran_berhenti', 'DATE NULL']];
  for (const [nama, def] of kolW) {
    const [ada] = await db.query("SELECT 1 FROM information_schema.columns WHERE table_schema = ? AND table_name = 'warga' AND column_name = ?", [DB_NAME, nama]);
    if (!ada.length) { await db.query(`ALTER TABLE warga ADD COLUMN ${nama} ${def}`); log.push(`kolom warga.${nama} ditambahkan`); }
  }

  // 3) Brand
  const [nmRows] = await db.query("SELECT nilai FROM pengaturan WHERE kunci = 'nama_web'");
  const nm = nmRows[0] ? String(nmRows[0].nilai || '') : '';
  if (!nm || (/PENCIL/i.test(nm) && !/E-Kas/i.test(nm))) {
    await db.query("INSERT INTO pengaturan (kunci, nilai) VALUES ('nama_web', 'E-Kas RW 03 Dukuh Pencil') ON DUPLICATE KEY UPDATE nilai = VALUES(nilai)");
    await db.query("INSERT INTO pengaturan (kunci, nilai) VALUES ('subjudul', 'Pengelolaan Kas RW 03 · Munggung, Karangdowo') ON DUPLICATE KEY UPDATE nilai = VALUES(nilai)");
    log.push('nama web diubah menjadi E-Kas (dapat diubah di Pengaturan → Identitas)');
  }

  console.log(log.length ? 'Perubahan:\n  - ' + log.join('\n  - ') : 'Tidak ada yang perlu diubah (sudah termigrasi).');
  const [rolls] = await db.query('SELECT role, COUNT(*) AS n FROM pengguna GROUP BY role');
  console.log('Akun per peran: ' + rolls.map((r) => `${r.role}=${r.n}`).join(', '));
  console.log('\nLangkah berikutnya (admin, di aplikasi): Pengaturan → Iuran Wajib → isi nominal per periode & tanggal mulai penagihan.');
  await db.end();
})().catch((e) => { console.error('GAGAL:', e.message); process.exit(1); });
