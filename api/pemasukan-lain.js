const db = require('./db');
const { route, fail, str, int, oneOf, RT_LIST, butuh } = require('./_lib/http');
const { punya, peranTerbatasRt } = require('./_lib/izin');
const { catat, newId } = require('./_lib/util');
const L = require('./_lib/laporan');
const { basisAwal } = require('./_lib/kas');
const P = require('./_lib/periode');
const { pastikanTerbuka } = require('./_lib/tutupbuku');

// Jenis pemasukan lainnya
const JENIS = ['hasil_sewa', 'donasi', 'lainnya'];
// Kolom `jenis` ditambahkan otomatis bila belum ada (tanpa perlu menjalankan migrasi manual)
let kolomSiap = null;
const pastikanKolom = () => kolomSiap || (kolomSiap = (async () => {
  const r = await db.query("SELECT 1 AS ada FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sewa_aset' AND COLUMN_NAME = 'jenis'");
  if (!r.rows.length) await db.query("ALTER TABLE sewa_aset ADD COLUMN jenis ENUM('hasil_sewa','donasi','lainnya') NOT NULL DEFAULT 'hasil_sewa' AFTER rt");
})().catch((e) => { kolomSiap = null; throw e; }));

/**
 * Pemasukan lainnya (hasil sewa, donasi, lainnya): hanya PENERIMAAN (tanpa data penyewa/pemberi).
 * Pengurus RT: hanya RT-nya. Bendahara RW: semua RT (dan RW umum). Admin: hanya melihat.
 * Laporan dikelompokkan per periode kumpulan (Selasa Kliwon).
 */
// Peran "dibatasi RT": hanya RT yang tertera pada akunnya
const terbatasRt = (user) => peranTerbatasRt(user.role);
const rtBatas = (user) => (terbatasRt(user) ? user.rt : null);

module.exports = route({
  GET: {
    auth: butuh('sewa.lihat'),
    fn: async (req, res, user) => {
      await pastikanKolom();
      const q = req.query || {};
      const batas = rtBatas(user);
      if (terbatasRt(user) && !batas) throw fail(403, 'Akun pengurus RT belum diatur RT-nya. Hubungi admin.');
      const today = P.todayWIB();
      // Filter kumpulan RW (cut off, sama dengan Laporan): K-34 s.d. K; kumpulan ke-1 sejak saldo awal berlaku
      const daftarPeriode = L.daftarPeriode(today);
      const where = [];
      const params = [];
      if (batas) { where.push('rt = ?'); params.push(batas); }
      else if (q.rt) { where.push('rt = ?'); params.push(oneOf(String(q.rt), 'RT', RT_LIST)); }
      if (q.periode) {
        const p = L.bacaPeriode(String(q.periode), today);
        const nomor = daftarPeriode.find((x) => x.tanggal === p.tanggal);
        let dari = p.mulai;
        if (nomor && nomor.no === 1) { const basis = await basisAwal(p.akhir < today ? p.akhir : today); if (basis) dari = basis.mulai; }
        where.push('tanggal BETWEEN ? AND ?');
        params.push(dari, p.akhir);
      }
      const r = await db.query(
        `SELECT id, tanggal, created_at, rt, jenis, uraian, nominal, petugas, catatan, status, alasan_batal
         FROM sewa_aset ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
         ORDER BY tanggal DESC, created_at DESC LIMIT 500`, params
      );
      return {
        sewa: r.rows.map((x) => ({ ...x, tanggal: String(x.tanggal).slice(0, 10), created_at: x.created_at ? new Date(x.created_at).toISOString() : '' })),
        daftar_periode: daftarPeriode, batas_rt: batas, bisa_tulis: punya(user, 'sewa.tulis')
      };
    }
  },

  POST: {
    auth: butuh('sewa.tulis'),
    status: 201,
    fn: async (req, res, user) => {
      await pastikanKolom();
      const b = req.body || {};
      const today = P.todayWIB();
      const tanggal = b.tanggal ? String(b.tanggal) : today;
      if (!P.validDate(tanggal)) throw fail(400, 'Tanggal tidak valid.');
      if (tanggal > today) throw fail(400, 'Tanggal tidak boleh di masa depan.');
      const uraian = str(b.uraian, 'Uraian', { min: 3, max: 200, required: true });
      const nominal = int(b.nominal, 'Nominal', { min: 1, max: 1000000000 });
      const catatan = str(b.catatan, 'Catatan', { max: 255 }) || null;
      const jenis = oneOf(String(b.jenis || 'lainnya'), 'Jenis', JENIS);
      let rt;
      if (terbatasRt(user)) {
        if (!user.rt) throw fail(403, 'Akun pengurus RT belum diatur RT-nya. Hubungi admin.');
        rt = user.rt;
      } else {
        rt = b.rt ? oneOf(String(b.rt), 'RT', RT_LIST) : null; // kosong = aset RW
      }
      await pastikanTerbuka(tanggal);
      const id = newId('SWA');
      await db.query(
        'INSERT INTO sewa_aset (id, tanggal, rt, jenis, uraian, nominal, petugas, catatan) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [id, tanggal, rt, jenis, uraian, nominal, user.username, catatan]
      );
      require('./_lib/cache-publik').invalidatePublik();
      await catat(user, 'SEWA_ASET', `Pemasukan lainnya (${jenis}) "${uraian}"${rt ? ' RT ' + rt : ''} Rp ${nominal} tanggal ${tanggal} (${id}).`, req);
      return { id };
    }
  },

  PUT: {
    auth: butuh('sewa.tulis'),
    fn: async (req, res, user) => {
      const b = req.body || {};
      const id = str(b.id, 'ID', { max: 40, required: true });
      const alasan = str(b.alasan, 'Alasan pembatalan', { min: 3, max: 255, required: true });
      const s = (await db.query('SELECT id, status, rt, tanggal, uraian, nominal FROM sewa_aset WHERE id = ?', [id])).rows[0];
      if (!s) throw fail(404, 'Data tidak ditemukan.');
      if (s.status === 'batal') throw fail(400, 'Sudah dibatalkan.');
      if (terbatasRt(user) && s.rt !== user.rt) throw fail(403, 'Anda hanya dapat mengelola data RT Anda sendiri.');
      await pastikanTerbuka(s.tanggal);
      await db.query("UPDATE sewa_aset SET status = 'batal', alasan_batal = ? WHERE id = ?", [alasan, id]);
      require('./_lib/cache-publik').invalidatePublik();
      await catat(user, 'BATAL_SEWA_ASET', `Membatalkan pemasukan lainnya ${id} ("${s.uraian}", Rp ${s.nominal}): ${alasan}`, req);
      return { id };
    }
  }
});
