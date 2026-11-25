const db = require('../db');
const { fail } = require('./http');
const { newId } = require('./util');

/* =====================================================================================
 * TABUNGAN WARGA — simpanan milik warga yang dititipkan ke RW (BUKAN pemasukan kas RW).
 * Mengikuti periode kumpulan RW (Selasa Kliwon, 35 hari, nomor K sama dengan Laporan/Iuran).
 * Saldo = total setor sah − total tarik sah. Hanya warga dengan "ikut_tabungan" yang tampil di papan.
 * ===================================================================================== */
const METODE = ['tunai', 'transfer'];
const JENIS = ['setor', 'tarik'];

// Tabel & hak akses dibuat otomatis bila belum ada (tanpa perlu menjalankan migrasi manual)
let siap = null;
const siapTabel = () => siap || (siap = (async () => {
  await db.query(`CREATE TABLE IF NOT EXISTS tabungan (
    id VARCHAR(40) PRIMARY KEY,
    warga_id INT NOT NULL,
    tanggal DATE NOT NULL,
    jenis ENUM('setor','tarik') NOT NULL DEFAULT 'setor',
    nominal INT NOT NULL,
    metode ENUM('tunai','transfer') NOT NULL DEFAULT 'tunai',
    petugas VARCHAR(50) NOT NULL,
    catatan VARCHAR(255) NULL,
    status ENUM('sah','batal') NOT NULL DEFAULT 'sah',
    alasan_batal VARCHAR(255) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_tab_warga (warga_id, status, tanggal),
    INDEX idx_tab_tgl (status, tanggal),
    CONSTRAINT fk_tab_warga FOREIGN KEY (warga_id) REFERENCES warga(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  const k = await db.query("SELECT 1 AS ada FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'warga' AND COLUMN_NAME = 'ikut_tabungan'");
  if (!k.rows.length) await db.query('ALTER TABLE warga ADD COLUMN ikut_tabungan TINYINT(1) NOT NULL DEFAULT 0');
  // Hak akses bawaan (sekali saja, saat izin belum pernah ada): admin & bendahara RW hanya melihat
  const ada = await db.query("SELECT 1 AS ada FROM peran_izin WHERE izin LIKE 'tabungan.%' LIMIT 1");
  if (!ada.rows.length) {
    const beri = [['admin', 'tabungan.lihat'], ['bendahara_rw', 'tabungan.lihat'], ['pengurus_rt', 'tabungan.lihat']];
    for (const [p, i] of beri) {
      await db.query('INSERT IGNORE INTO peran_izin (peran, izin) SELECT ?, ? FROM peran WHERE kode = ?', [p, i, p]);
    }
  }
  // Peran khusus "Pengurus Tabungan" (mencatat tabungan): dibuat sekali bila belum ada
  const ada2 = await db.query("SELECT (SELECT COUNT(*) FROM peran) AS n, (SELECT COUNT(*) FROM peran WHERE kode = 'pengurus_tabungan') AS ada");
  if (Number(ada2.rows[0].n) > 0 && !Number(ada2.rows[0].ada)) {
    await db.query("INSERT INTO peran (kode, nama, keterangan, sistem, batas_rt, dana_pengeluaran) VALUES ('pengurus_tabungan', 'Pengurus Tabungan', 'Mencatat tabungan warga (setor, tarik, batalkan) untuk semua RT; hanya menu Tabungan', 1, 0, 'umum')");
    for (const i of ['tabungan.lihat', 'tabungan.tulis']) await db.query("INSERT IGNORE INTO peran_izin (peran, izin) VALUES ('pengurus_tabungan', ?)", [i]);
  }
})().catch((e) => { siap = null; throw e; }));

// Saldo (setor − tarik) per warga; `idWarga` opsional
async function saldoWarga(idWarga) {
  const ph = idWarga && idWarga.length ? ` AND warga_id IN (${idWarga.map(() => '?').join(',')})` : '';
  const r = await db.query(
    `SELECT warga_id, SUM(CASE WHEN jenis = 'setor' THEN nominal ELSE -nominal END) AS saldo,
            SUM(CASE WHEN jenis = 'setor' THEN nominal ELSE 0 END) AS setor, SUM(CASE WHEN jenis = 'tarik' THEN nominal ELSE 0 END) AS tarik
     FROM tabungan WHERE status = 'sah'${ph} GROUP BY warga_id`, idWarga && idWarga.length ? idWarga : []
  );
  return new Map(r.rows.map((x) => [x.warga_id, { saldo: Number(x.saldo), setor: Number(x.setor), tarik: Number(x.tarik) }]));
}

async function simpanTabungan({ user, warga, tanggal, jenis, nominal, metode, catatan, abaikanDuplikat }) {
  const nom = Number(nominal);
  if (!Number.isInteger(nom) || nom <= 0 || nom > 2000000000) throw fail(400, 'Nominal harus bilangan bulat lebih dari 0.');
  const jn = JENIS.includes(jenis) ? jenis : 'setor';
  if (jn === 'tarik') {
    const s = (await saldoWarga([warga.id])).get(warga.id);
    const saldo = s ? s.saldo : 0;
    if (nom > saldo) throw fail(400, `${warga.nama}: penarikan Rp ${nom.toLocaleString('id-ID')} melebihi saldo tabungan Rp ${saldo.toLocaleString('id-ID')}.`);
  }
  if (!abaikanDuplikat) {
    const d = await db.query(
      "SELECT id FROM tabungan WHERE warga_id = ? AND tanggal = ? AND nominal = ? AND jenis = ? AND status = 'sah' LIMIT 1", [warga.id, tanggal, nom, jn]
    );
    if (d.rows.length) {
      const e = fail(409, `${warga.nama}: sudah ada ${jn === 'tarik' ? 'penarikan' : 'setoran'} tabungan Rp ${nom.toLocaleString('id-ID')} pada tanggal ini. Yakin menambah lagi?`);
      e.kode = 'DUPLIKAT';
      throw e;
    }
  }
  const id = newId('TAB');
  await db.query(
    'INSERT INTO tabungan (id, warga_id, tanggal, jenis, nominal, metode, petugas, catatan) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [id, warga.id, tanggal, jn, nom, METODE.includes(metode) ? metode : 'tunai', user.username, catatan || null]
  );
  return { id, nominal: nom, jenis: jn };
}

module.exports = { METODE, JENIS, siapTabel, saldoWarga, simpanTabungan };
