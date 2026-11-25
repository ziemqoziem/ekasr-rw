/**
 * HAK AKSES PERAN — dapat diatur admin (tabel `peran` & `peran_izin`).
 * Katalog izin (apa yang dapat dikunci) didefinisikan di kode; peran & isinya disimpan di database.
 * Bila tabel belum ada/kosong (sebelum migrasi) dipakai BAWAAN di bawah.
 * Format izin: "<modul>.<lihat|tulis|kelola>".
 */
const KATALOG = [
  { kelompok: 'Jimpitan', izin: 'jimpitan.lihat', label: 'Melihat jimpitan', info: 'Kalender setoran, tunggakan, saldo warga' },
  { kelompok: 'Jimpitan', izin: 'jimpitan.tulis', label: 'Mencatat jimpitan', info: 'Setor, setor massal, batalkan setoran' },
  { kelompok: 'Iuran Wajib', izin: 'iuran.lihat', label: 'Melihat iuran wajib', info: 'Papan per periode kumpulan' },
  { kelompok: 'Iuran Wajib', izin: 'iuran.tulis', label: 'Mencatat iuran wajib', info: 'Bayar, simpan massal, batalkan' },
  { kelompok: 'Pemasukan Lainnya', izin: 'sewa.lihat', label: 'Melihat pemasukan lainnya', info: 'Penerimaan (sewa aset, donasi, dll.) & laporan per periode' },
  { kelompok: 'Pemasukan Lainnya', izin: 'sewa.tulis', label: 'Mencatat pemasukan lainnya', info: 'Tambah / batalkan penerimaan' },
  { kelompok: 'Kas', izin: 'pengeluaran.lihat', label: 'Melihat pengeluaran', info: '' },
  { kelompok: 'Kas', izin: 'pengeluaran.tulis', label: 'Mencatat pengeluaran', info: 'Catat & batalkan pengeluaran' },
  { kelompok: 'Kas', izin: 'kas.lihat', label: 'Melihat buku kas', info: 'Buku kas, saldo per sumber, laporan per periode' },
  { kelompok: 'Kas', izin: 'tutupbuku.tulis', label: 'Menutup buku (31 Des)', info: 'Saldo akhir → saldo awal tahun berikutnya' },
  { kelompok: 'Kas', izin: 'tutupbuku.buka', label: 'Membuka kembali tutup buku', info: 'Tahun terakhir saja' },
  { kelompok: 'Kas', izin: 'saldokas.kelola', label: 'Mengisi saldo awal kas', info: 'Saldo awal per sumber tahun buku pertama' },
  { kelompok: 'Laporan', izin: 'laporan.lihat', label: 'Melihat laporan jimpitan', info: '' },
  { kelompok: 'Laporan', izin: 'dashboard.lihat', label: 'Melihat Beranda lengkap (dashboard)', info: 'Analisis jimpitan; kas tampil bila punya izin buku kas' },
  { kelompok: 'Data Induk', izin: 'warga.lihat', label: 'Melihat data warga (menu Warga)', info: 'Tanpa izin ini, peran tetap dapat memilih nama warga di kalender' },
  { kelompok: 'Data Induk', izin: 'warga.kelola', label: 'Mengelola data warga', info: 'Tambah/ubah, status iuran jimpitan & iuran kas' },
  { kelompok: 'Data Induk', izin: 'saldoawal.kelola', label: 'Mengelola tunggakan lama (saldo awal warga)', info: 'Impor CSV / tambah manual' },
  { kelompok: 'Sistem', izin: 'sistem.kelola', label: 'Mengelola sistem', info: 'Akun, hak akses peran, tarif, pengaturan, log' }
];
const SEMUA_IZIN = KATALOG.map((k) => k.izin);

// Izin yang otomatis ikut (mencatat → harus bisa melihat)
const DEPEN = {
  'jimpitan.tulis': ['jimpitan.lihat'], 'iuran.tulis': ['iuran.lihat'], 'sewa.tulis': ['sewa.lihat'],
  'pengeluaran.tulis': ['pengeluaran.lihat'], 'warga.kelola': ['warga.lihat'],
  'tutupbuku.tulis': ['kas.lihat'], 'tutupbuku.buka': ['kas.lihat'], 'saldokas.kelola': ['kas.lihat']
};
function lengkapi(izin) {
  const s = new Set((izin || []).filter((i) => SEMUA_IZIN.includes(i)));
  for (const i of [...s]) for (const d of DEPEN[i] || []) s.add(d);
  return SEMUA_IZIN.filter((i) => s.has(i)); // urutan katalog
}

// Izin yang SELALU dimiliki peran admin (tidak dapat dicabut): akses ke semua menu + mengelola sistem & data induk
const ADMIN_WAJIB = SEMUA_IZIN.filter((i) => i.endsWith('.lihat')).concat(['sistem.kelola', 'warga.kelola']);

// Peran bawaan (dipakai migrasi/init-db untuk mengisi tabel, dan sebagai cadangan bila tabel belum ada)
const BAWAAN = {
  admin: {
    nama: 'Admin Sistem', keterangan: 'Mengakses semua menu; mengonfigurasi sistem & data induk (akun, hak akses, tarif, warga); tidak mencatat transaksi',
    batas_rt: 0, izin: [...new Set([...ADMIN_WAJIB, 'saldoawal.kelola', 'saldokas.kelola', 'tutupbuku.buka'])]
  },
  bendahara_rw: {
    nama: 'Bendahara RW', keterangan: 'Mencatat pemasukan lainnya dan semua pengeluaran; melihat iuran wajib & jimpitan; memegang buku kas tunggal',
    batas_rt: 0, dana_pengeluaran: 'iuran_wajib', izin: ['jimpitan.lihat', 'iuran.lihat', 'sewa.lihat', 'sewa.tulis', 'pengeluaran.lihat', 'pengeluaran.tulis',
      'kas.lihat', 'tutupbuku.tulis', 'laporan.lihat', 'dashboard.lihat']
  },
  bendahara_jimpitan: {
    nama: 'Bendahara Jimpitan', keterangan: 'Mencatat jimpitan (semua RT) dan pengeluaran dari dana jimpitan',
    batas_rt: 0, dana_pengeluaran: 'jimpitan', izin: ['jimpitan.lihat', 'jimpitan.tulis', 'pengeluaran.lihat', 'pengeluaran.tulis', 'laporan.lihat', 'dashboard.lihat']
  },
  pengurus_rt: {
    nama: 'Pengurus RT', keterangan: 'Mencatat iuran wajib & melihat warga di RT-nya saja; melihat dashboard RT',
    batas_rt: 1, izin: ['iuran.lihat', 'iuran.tulis', 'warga.lihat', 'dashboard.lihat']
  }
};
const PERAN_SISTEM = Object.keys(BAWAAN);

/* ---------- cache izin dari database ---------- */
let cache = null;          // Map(kode → { nama, keterangan, sistem, izin: [] })
let cacheAt = 0;
let peringatan = false;
const TTL = 30 * 1000;

const dariBawaan = () => {
  const m = new Map();
  for (const [k, v] of Object.entries(BAWAAN)) m.set(k, { nama: v.nama, keterangan: v.keterangan, sistem: 1, batas_rt: v.batas_rt || 0, dana_pengeluaran: v.dana_pengeluaran || 'umum', izin: [...v.izin] });
  return m;
};

async function siap(paksa) {
  if (!paksa && cache && Date.now() - cacheAt < TTL) return;
  try {
    const db = require('../db');
    const p = await db.query('SELECT kode, nama, keterangan, sistem, batas_rt, dana_pengeluaran FROM peran');
    if (!p.rows.length) { cache = dariBawaan(); }
    else {
      const iz = await db.query('SELECT peran, izin FROM peran_izin');
      const m = new Map(p.rows.map((x) => [x.kode, { nama: x.nama, keterangan: x.keterangan || '', sistem: Number(x.sistem), batas_rt: Number(x.batas_rt) || 0, dana_pengeluaran: x.dana_pengeluaran || 'umum', izin: [] }]));
      for (const x of iz.rows) if (m.has(x.peran) && SEMUA_IZIN.includes(x.izin)) m.get(x.peran).izin.push(x.izin);
      cache = m;
    }
  } catch (e) {
    cache = dariBawaan(); // tabel/kolom belum ada (sebelum migrasi)
    if (!peringatan) { peringatan = true; console.warn('[izin] Tabel peran belum siap — memakai hak akses bawaan. Jalankan: npm run migrasi-ekas  (' + e.message + ')'); }
  }
  cacheAt = Date.now();
}
const muatUlang = () => siap(true);

const daftarPeran = () => [...(cache || dariBawaan()).entries()].map(([kode, v]) => ({ kode, ...v }));
const infoPeran = (kode) => (cache || dariBawaan()).get(kode) || null;
const izinUntuk = (role) => (infoPeran(role) ? infoPeran(role).izin : []);
const punya = (user, izin) => !!user && izinUntuk(user.role).includes(izin);
// Peran "dibatasi RT": semua data warga/iuran/sewa yang diakses hanya milik RT pada akunnya
const peranTerbatasRt = (role) => !!(infoPeran(role) && infoPeran(role).batas_rt);
// Dana tempat pengeluaran yang dicatat peran ini diambil: 'jimpitan' | 'iuran_wajib' | 'umum'
const DANA_PENGELUARAN = ['umum', 'jimpitan', 'iuran_wajib'];
const danaPengeluaran = (user) => (user && infoPeran(user.role) && infoPeran(user.role).dana_pengeluaran) || 'umum';
const batasRt = (user) => (user && peranTerbatasRt(user.role) ? (user.rt || null) : null);

module.exports = {
  KATALOG, SEMUA_IZIN, DEPEN, ADMIN_WAJIB, BAWAAN, PERAN_SISTEM, lengkapi,
  siap, muatUlang, daftarPeran, infoPeran, izinUntuk, punya, peranTerbatasRt, batasRt, danaPengeluaran, DANA_PENGELUARAN
};
