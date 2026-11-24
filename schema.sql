-- ==============================================================================
-- DATABASE webrw3 — Pengelolaan Jimpitan/Iuran Warga
-- RW 03 DUKUH PENCIL, MUNGGUNG, KARANGDOWO
-- MariaDB 10.4+ (XAMPP) / MySQL 8
-- ==============================================================================

CREATE TABLE IF NOT EXISTS pengaturan (
  kunci VARCHAR(50) PRIMARY KEY,
  nilai TEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS pengguna (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  password_hash VARCHAR(200) NOT NULL,
  nama VARCHAR(150) NOT NULL,
  role VARCHAR(40) NOT NULL DEFAULT 'bendahara_jimpitan',
  rt CHAR(3) NULL,
  aktif TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS warga (
  id INT PRIMARY KEY,
  nama VARCHAR(150) NOT NULL,
  rt CHAR(3) NOT NULL,
  jenis ENUM('harian','mingguan','bulanan') NOT NULL,
  no_hp VARCHAR(20) NULL,
  alamat VARCHAR(200) NULL,
  mulai_iuran DATE NULL,
  berhenti_pada DATE NULL,
  aktif TINYINT(1) NOT NULL DEFAULT 1,
  -- Kewajiban per program: ikut=1 wajib; ikut=0 + *_berhenti terisi = wajib sampai tanggal itu; ikut=0 tanpa tanggal = bebas sejak awal
  ikut_jimpitan TINYINT(1) NOT NULL DEFAULT 1,
  jimpitan_berhenti DATE NULL,
  ikut_iuran TINYINT(1) NOT NULL DEFAULT 1,
  iuran_berhenti DATE NULL,
  catatan VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_warga_rt (rt),
  INDEX idx_warga_jenis (jenis),
  INDEX idx_warga_aktif (aktif)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tarif (
  id INT AUTO_INCREMENT PRIMARY KEY,
  jenis ENUM('harian','mingguan','bulanan') NOT NULL,
  nominal INT NOT NULL,
  berlaku_mulai DATE NOT NULL,
  UNIQUE KEY uq_tarif (jenis, berlaku_mulai)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Tunggakan bawaan tahun-tahun sebelumnya (impor / hasil Tutup Tahun / manual)
CREATE TABLE IF NOT EXISTS tunggakan_lama (
  id INT AUTO_INCREMENT PRIMARY KEY,
  warga_id INT NOT NULL,
  tahun SMALLINT NOT NULL,
  nominal INT NOT NULL,
  keterangan VARCHAR(255) NULL,
  sumber ENUM('impor','tutup_tahun','manual') NOT NULL DEFAULT 'manual',
  status ENUM('aktif','batal') NOT NULL DEFAULT 'aktif',
  dibuat_oleh VARCHAR(50) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_tl_warga (warga_id),
  CONSTRAINT fk_tl_warga FOREIGN KEY (warga_id) REFERENCES warga(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Setiap baris = satu pembayaran dengan nominal BEBAS (berapa pun, kapan pun, berapa kali pun).
-- Kewajiban dihitung harian (tarif harian × hari kalender); saldo = total setoran − kewajiban (lihat api/_lib/util.js).
-- Kolom periode_* dan tunggakan_id hanya untuk data warisan model lama (boleh NULL).
CREATE TABLE IF NOT EXISTS setoran (
  id VARCHAR(40) PRIMARY KEY,
  warga_id INT NOT NULL,
  tanggal DATE NOT NULL,
  tipe ENUM('rutin','tunggakan_lama') NOT NULL DEFAULT 'rutin',
  periode_jenis ENUM('harian','mingguan','bulanan') NULL,
  periode_kunci VARCHAR(10) NULL,
  tunggakan_id INT NULL,
  nominal INT NOT NULL,
  metode ENUM('tunai','transfer') NOT NULL DEFAULT 'tunai',
  petugas VARCHAR(50) NOT NULL,
  catatan VARCHAR(255) NULL,
  status ENUM('sah','batal') NOT NULL DEFAULT 'sah',
  alasan_batal VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_setoran_tanggal (tanggal),
  INDEX idx_setoran_warga (warga_id),
  INDEX idx_setoran_periode (periode_kunci),
  CONSTRAINT fk_setoran_warga FOREIGN KEY (warga_id) REFERENCES warga(id),
  CONSTRAINT fk_setoran_tl FOREIGN KEY (tunggakan_id) REFERENCES tunggakan_lama(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS pengeluaran (
  id VARCHAR(40) PRIMARY KEY,
  tanggal DATE NOT NULL,
  kategori VARCHAR(100) NOT NULL,
  uraian VARCHAR(255) NOT NULL,
  nominal INT NOT NULL,
  bukti VARCHAR(100) NULL,
  sumber ENUM('umum','jimpitan','iuran_wajib','sewa_aset') NOT NULL DEFAULT 'umum',
  petugas VARCHAR(50) NOT NULL,
  status ENUM('sah','batal') NOT NULL DEFAULT 'sah',
  alasan_batal VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_pengeluaran_tanggal (tanggal)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS log_aktivitas (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  waktu DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  username VARCHAR(50) NOT NULL,
  nama VARCHAR(150) NULL,
  role VARCHAR(20) NULL,
  aksi VARCHAR(50) NOT NULL,
  deskripsi VARCHAR(1000) NOT NULL,
  ip_address VARCHAR(50) NULL,
  INDEX idx_log_waktu (waktu)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ==============================================================================
-- E-Kas: iuran wajib per periode kumpulan (Rabu Legi, 35 hari), tarifnya, dan penerimaan sewa aset
-- ==============================================================================
CREATE TABLE IF NOT EXISTS tarif_iuran (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nominal INT NOT NULL,
  berlaku_mulai DATE NOT NULL,
  UNIQUE KEY uq_tarif_iuran (berlaku_mulai)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Setiap baris = satu pembayaran iuran wajib, nominal BEBAS; dialokasikan ke periode tertua dulu (lihat api/_lib/iuran.js)
CREATE TABLE IF NOT EXISTS iuran_wajib (
  id VARCHAR(40) PRIMARY KEY,
  warga_id INT NOT NULL,
  tanggal DATE NOT NULL,
  nominal INT NOT NULL,
  metode ENUM('tunai','transfer') NOT NULL DEFAULT 'tunai',
  petugas VARCHAR(50) NOT NULL,
  catatan VARCHAR(255) NULL,
  status ENUM('sah','batal') NOT NULL DEFAULT 'sah',
  alasan_batal VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_iuran_tanggal (tanggal),
  INDEX idx_iuran_warga (warga_id),
  CONSTRAINT fk_iuran_warga FOREIGN KEY (warga_id) REFERENCES warga(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Penerimaan sewa aset: hanya pemasukan (tanpa data penyewa). rt NULL = aset RW.
CREATE TABLE IF NOT EXISTS sewa_aset (
  id VARCHAR(40) PRIMARY KEY,
  tanggal DATE NOT NULL,
  rt CHAR(3) NULL,
  jenis ENUM('hasil_sewa','donasi','lainnya') NOT NULL DEFAULT 'hasil_sewa',
  uraian VARCHAR(200) NOT NULL,
  nominal INT NOT NULL,
  metode ENUM('tunai','transfer') NOT NULL DEFAULT 'tunai',
  petugas VARCHAR(50) NOT NULL,
  catatan VARCHAR(255) NULL,
  status ENUM('sah','batal') NOT NULL DEFAULT 'sah',
  alasan_batal VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_sewa_tanggal (tanggal),
  INDEX idx_sewa_rt (rt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ==============================================================================
-- Saldo awal kas per sumber & tutup buku (per 31 Desember)
--   saldo_awal(tahun) = saldo per 31 Des (tahun-1), berlaku mulai 1 Jan tahun tersebut.
--   'umum' = pengeluaran tanpa label sumber (nominal negatif / nol).
-- ==============================================================================
CREATE TABLE IF NOT EXISTS saldo_awal (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tahun SMALLINT NOT NULL,
  sumber ENUM('jimpitan','iuran_wajib','sewa_aset','umum') NOT NULL,
  nominal INT NOT NULL DEFAULT 0,
  asal ENUM('manual','tutup_buku') NOT NULL DEFAULT 'manual',
  keterangan VARCHAR(255) NULL,
  dibuat_oleh VARCHAR(50) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_saldo_awal (tahun, sumber)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tutup_buku (
  tahun SMALLINT PRIMARY KEY,
  ditutup_oleh VARCHAR(50) NOT NULL,
  ditutup_pada DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  catatan VARCHAR(255) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ==============================================================================
-- Hak akses peran yang dapat diatur admin (katalog izin ada di api/_lib/izin.js)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS peran (
  kode VARCHAR(40) PRIMARY KEY,
  nama VARCHAR(80) NOT NULL,
  keterangan VARCHAR(255) NULL,
  sistem TINYINT(1) NOT NULL DEFAULT 0,
  batas_rt TINYINT(1) NOT NULL DEFAULT 0,   -- 1 = hanya mengakses data RT pada akun (mis. Pengurus RT)
  dana_pengeluaran VARCHAR(20) NOT NULL DEFAULT 'umum',   -- pengeluaran yang dicatat peran ini diambil dari: jimpitan | iuran_wajib | umum
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS peran_izin (
  peran VARCHAR(40) NOT NULL,
  izin VARCHAR(50) NOT NULL,
  PRIMARY KEY (peran, izin)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
