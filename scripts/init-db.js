/**
 * Inisialisasi database `webrw3`:
 *   npm run init-db                 → buat database & tabel, isi pengaturan/tarif/admin, impor warga dari xlsx
 *   npm run impor-warga             → hanya impor ulang daftar warga dari "list jimpitan.xlsx"
 *
 * Aman dijalankan berulang: tidak menghapus data. Impor warga hanya memperbarui nama/RT/jenis
 * (no HP, alamat, status aktif yang sudah Anda isi tidak ditimpa).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { loadEnv } = require('../api/_lib/env');
loadEnv();

const mysql = require('mysql2/promise');
const readXlsxFile = require('read-excel-file/node');
const { hashPassword } = require('../api/_lib/auth');
const P = require('../api/_lib/periode');

const ROOT = path.join(__dirname, '..');
const XLSX = process.env.XLSX_WARGA || path.join(ROOT, 'list jimpitan.xlsx');
const DB_NAME = process.env.DB_NAME || 'webrw3';
const wargaSaja = process.argv.includes('--warga-saja');

function connConfig(withDb) {
  const cfg = {
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    charset: 'utf8mb4'
  };
  if (process.env.DB_SOCKET) { cfg.socketPath = process.env.DB_SOCKET; delete cfg.host; delete cfg.port; }
  if (withDb) cfg.database = DB_NAME;
  return cfg;
}

function bacaWarga(rows) {
  const out = [];
  const galat = [];
  const JENIS = ['harian', 'mingguan', 'bulanan'];
  rows.slice(1).forEach((r, i) => {
    const [no, nama, rt, jenis] = r;
    if (no === null && !nama) return; // baris kosong
    const id = Number(no);
    const rtS = String(rt === null || rt === undefined ? '' : rt).trim().padStart(3, '0');
    const j = String(jenis || '').trim().toLowerCase();
    if (!Number.isInteger(id) || id < 1 || !nama || !['007', '008', '009'].includes(rtS) || !JENIS.includes(j)) {
      galat.push(`Baris ${i + 2}: ${JSON.stringify(r)}`);
      return;
    }
    out.push({ id, nama: String(nama).trim().toUpperCase(), rt: rtS, jenis: j });
  });
  return { out, galat };
}

async function imporWarga(db) {
  if (!fs.existsSync(XLSX)) throw new Error(`File xlsx tidak ditemukan: ${XLSX}`);
  const rows = await readXlsxFile(XLSX);
  const { out, galat } = bacaWarga(rows);
  if (galat.length) {
    console.warn(`PERINGATAN: ${galat.length} baris dilewati:\n  ` + galat.join('\n  '));
  }
  for (const w of out) {
    await db.query(
      `INSERT INTO warga (id, nama, rt, jenis) VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE nama = VALUES(nama), rt = VALUES(rt), jenis = VALUES(jenis)`,
      [w.id, w.nama, w.rt, w.jenis]
    );
  }
  const [rekap] = await db.query('SELECT rt, jenis, COUNT(*) AS n FROM warga GROUP BY rt, jenis ORDER BY rt, jenis');
  console.log(`Warga diimpor: ${out.length} baris dari ${path.basename(XLSX)}`);
  for (const r of rekap) console.log(`  RT ${r.rt} ${r.jenis}: ${r.n}`);
}

async function main() {
  if (wargaSaja) {
    const db = await mysql.createConnection(connConfig(true));
    await imporWarga(db);
    await db.end();
    return;
  }

  // 1. Database
  const root = await mysql.createConnection(connConfig(false));
  await root.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await root.end();
  const db = await mysql.createConnection(connConfig(true));
  await db.query("SET time_zone = '+00:00'");

  // 2. Tabel
  const schema = fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8')
    .split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
  for (const stmt of schema.split(';').map((s) => s.trim()).filter(Boolean)) await db.query(stmt);
  console.log(`Tabel siap di database "${DB_NAME}".`);

  // 3. Pengaturan & tarif
  const today = P.todayWIB();
  const pengaturan = {
    nama_web: 'E-Kas RW 03 Dukuh Pencil',
    subjudul: 'Pengelolaan Kas RW 03 · Munggung, Karangdowo',
    mulai_hitung: today
  };
  for (const [k, v] of Object.entries(pengaturan)) {
    await db.query('INSERT IGNORE INTO pengaturan (kunci, nilai) VALUES (?, ?)', [k, v]); // tidak menimpa
  }
  await db.query("INSERT IGNORE INTO tarif (jenis, nominal, berlaku_mulai) VALUES ('harian', 500, '2000-01-01')");

  // 4. Warga dari xlsx
  await imporWarga(db);

  // 4b. Peran & hak akses bawaan (dapat diubah admin di Pengaturan → Hak Akses Peran)
  const { BAWAAN } = require('../api/_lib/izin');
  for (const [kode, v] of Object.entries(BAWAAN)) {
    const [r] = await db.query('INSERT IGNORE INTO peran (kode, nama, keterangan, sistem, batas_rt, dana_pengeluaran) VALUES (?, ?, ?, 1, ?, ?)', [kode, v.nama, v.keterangan, v.batas_rt || 0, v.dana_pengeluaran || 'umum']);
    if (r.affectedRows) for (const i of v.izin) await db.query('INSERT IGNORE INTO peran_izin (peran, izin) VALUES (?, ?)', [kode, i]);
  }

  // 5. Admin pertama (hanya jika belum ada admin)
  const [[{ n }]] = await db.query("SELECT COUNT(*) AS n FROM pengguna WHERE role = 'admin'");
  if (n === 0) {
    const username = (process.env.ADMIN_USERNAME || 'admin').toLowerCase();
    const generated = !process.env.ADMIN_PASSWORD;
    const password = process.env.ADMIN_PASSWORD || crypto.randomBytes(9).toString('base64url');
    if (password.length < 8) throw new Error('ADMIN_PASSWORD minimal 8 karakter.');
    await db.query(
      "INSERT INTO pengguna (username, password_hash, nama, role) VALUES (?, ?, 'Administrator RW', 'admin')",
      [username, hashPassword(password)]
    );
    console.log('\n==== AKUN ADMIN PERTAMA ====');
    console.log(`Username : ${username}`);
    console.log(generated ? `Password : ${password}   (dibuat acak — catat sekarang, tidak ditampilkan lagi)` : 'Password : sesuai ADMIN_PASSWORD di .env');
    console.log('Segera tambah akun bendahara RW, bendahara jimpitan, dan pengurus RT di menu Pengaturan → Akun.\n');
  } else {
    console.log('Admin sudah ada; akun tidak diubah.');
  }
  console.log('Tarif harian Rp 500 sudah diisi (kewajiban dihitung harian untuk semua warga).');
  await db.end();
}

main().catch((e) => {
  console.error('GAGAL:', e.message);
  process.exit(1);
});
