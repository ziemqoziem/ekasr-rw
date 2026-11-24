/**
 * Migrasi ke MODEL SALDO (kewajiban harian + setoran nominal bebas).
 *   npm run migrasi-saldo
 *
 * Aman dijalankan berulang (idempoten) dan TIDAK menghapus data:
 *   1) menghapus aturan unik "satu setoran per periode" pada tabel setoran (kolom kunci_unik),
 *   2) menambah warga.berhenti_pada, lalu mengisinya untuk warga yang sudah nonaktif.
 * Semua setoran lama otomatis menjadi pembayaran yang dihitung ke saldo.
 *
 * WAJIB cadangkan database lebih dulu:  mysqldump -u <user> -p webrw3 > cadangan.sql
 */
const { loadEnv } = require('../api/_lib/env');
loadEnv();
const mysql = require('mysql2/promise');

const DB_NAME = process.env.DB_NAME || 'webrw3';
const cfg = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: DB_NAME
};
if (process.env.DB_SOCKET) { cfg.socketPath = process.env.DB_SOCKET; delete cfg.host; delete cfg.port; }

async function ada(db, sql, params) { const [r] = await db.query(sql, params); return r.length > 0; }

(async () => {
  const db = await mysql.createConnection(cfg);
  const log = [];

  // 1) aturan unik per periode
  const adaIndeks = await ada(db, `SELECT 1 FROM information_schema.statistics WHERE table_schema = ? AND table_name = 'setoran' AND index_name = 'uq_setoran_periode'`, [DB_NAME]);
  if (adaIndeks) { await db.query('ALTER TABLE setoran DROP INDEX uq_setoran_periode'); log.push('indeks uq_setoran_periode dihapus'); }
  const adaKolom = await ada(db, `SELECT 1 FROM information_schema.columns WHERE table_schema = ? AND table_name = 'setoran' AND column_name = 'kunci_unik'`, [DB_NAME]);
  if (adaKolom) { await db.query('ALTER TABLE setoran DROP COLUMN kunci_unik'); log.push('kolom kunci_unik dihapus'); }

  // 2) berhenti_pada
  const adaBerhenti = await ada(db, `SELECT 1 FROM information_schema.columns WHERE table_schema = ? AND table_name = 'warga' AND column_name = 'berhenti_pada'`, [DB_NAME]);
  if (!adaBerhenti) { await db.query('ALTER TABLE warga ADD COLUMN berhenti_pada DATE NULL AFTER mulai_iuran'); log.push('kolom warga.berhenti_pada ditambahkan'); }
  const [u] = await db.query('UPDATE warga SET berhenti_pada = DATE(updated_at) WHERE aktif = 0 AND berhenti_pada IS NULL');
  if (u.affectedRows) log.push(`${u.affectedRows} warga nonaktif diberi tanggal berhenti`);

  const [[s]] = await db.query("SELECT COUNT(*) AS n, COALESCE(SUM(nominal), 0) AS total FROM setoran WHERE status = 'sah'");
  console.log(log.length ? 'Perubahan:\n  - ' + log.join('\n  - ') : 'Tidak ada yang perlu diubah (sudah termigrasi).');
  console.log(`Setoran sah yang dihitung ke saldo: ${s.n} baris, total Rp ${Number(s.total).toLocaleString('id-ID')}`);
  console.log('Catatan: setoran bertanggal SEBELUM "mulai hitung" (Pengaturan) tidak dihitung ke saldo.');
  await db.end();
})().catch((e) => { console.error('GAGAL:', e.message); process.exit(1); });
