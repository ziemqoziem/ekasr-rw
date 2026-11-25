const db = require('./db');
const { route, fail, str, int, butuh } = require('./_lib/http');
const { catat, newId } = require('./_lib/util');
const P = require('./_lib/periode');
const { pastikanTerbuka } = require('./_lib/tutupbuku');

const { punya, danaPengeluaran } = require('./_lib/izin');
const L = require('./_lib/laporan');
const { basisAwal } = require('./_lib/kas');

const NAMA_DANA = { umum: 'umum', jimpitan: 'dana jimpitan', iuran_wajib: 'dana iuran wajib', sewa_aset: 'dana pemasukan lainnya' };
// Pemegang buku kas (izin kas.lihat, mis. Bendahara RW) boleh mengubah semua pengeluaran; peran lain hanya pengeluaran dari dananya sendiri
const bolehUbah = (user, row) => punya(user, 'kas.lihat') || row.sumber === danaPengeluaran(user);

module.exports = route({
  GET: {
    auth: butuh('pengeluaran.lihat'),
    fn: async (req, res, user) => {
      const q = req.query || {};
      const where = [];
      const params = [];
      // Filter kumpulan RW (cut off, sama dengan Laporan): K-34 s.d. K; kumpulan ke-1 sejak saldo awal berlaku
      const today = P.todayWIB();
      const daftarPeriode = L.daftarPeriode(today);
      if (q.periode) {
        const p = L.bacaPeriode(String(q.periode), today);
        const nomor = daftarPeriode.find((x) => x.tanggal === p.tanggal);
        let dari = p.mulai;
        if (nomor && nomor.no === 1) { const basis = await basisAwal(p.akhir < today ? p.akhir : today); if (basis) dari = basis.mulai; }
        where.push('tanggal BETWEEN ? AND ?');
        params.push(dari, p.akhir);
      }
      if (q.dari) { if (!P.validDate(String(q.dari))) throw fail(400, 'Tanggal "dari" tidak valid.'); where.push('tanggal >= ?'); params.push(String(q.dari)); }
      if (q.sampai) { if (!P.validDate(String(q.sampai))) throw fail(400, 'Tanggal "sampai" tidak valid.'); where.push('tanggal <= ?'); params.push(String(q.sampai)); }
      // Tanpa izin buku kas, hanya pengeluaran dari dana peran itu sendiri yang terlihat
      // Peran yang terikat satu dana (Bendahara RW → iuran wajib, Bendahara Jimpitan → jimpitan) hanya melihat pengeluaran dana itu
      const danaSendiri = danaPengeluaran(user);
      const lihatSemua = punya(user, 'kas.lihat') && danaSendiri === 'umum';
      if (!lihatSemua) { where.push('sumber = ?'); params.push(danaSendiri); }
      const r = await db.query(
        `SELECT id, tanggal, kategori, uraian, nominal, bukti, sumber, petugas, status, alasan_batal
         FROM pengeluaran ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
         ORDER BY tanggal DESC, created_at DESC LIMIT 500`,
        params
      );
      return {
        pengeluaran: r.rows.map((x) => ({ ...x, boleh_ubah: bolehUbah(user, x) })),
        dana: danaPengeluaran(user), lihat_semua: lihatSemua, daftar_periode: daftarPeriode
      };
    }
  },
  // Dana asal ditentukan OTOMATIS dari peran pencatat (Bendahara Jimpitan → jimpitan, Bendahara RW → iuran wajib)
  POST: {
    auth: butuh('pengeluaran.tulis'),
    status: 201,
    fn: async (req, res, user) => {
      const b = req.body || {};
      const today = P.todayWIB();
      const tanggal = b.tanggal ? String(b.tanggal) : today;
      if (!P.validDate(tanggal)) throw fail(400, 'Tanggal tidak valid.');
      if (tanggal > today) throw fail(400, 'Tanggal tidak boleh di masa depan.');
      const kategori = str(b.kategori, 'Kategori', { max: 100, required: true });
      const uraian = str(b.uraian, 'Uraian', { max: 255, min: 3, required: true });
      const nominal = int(b.nominal, 'Nominal', { min: 1, max: 1000000000 });
      const bukti = str(b.bukti, 'Bukti', { max: 100 }) || null;
      const sumber = danaPengeluaran(user);
      await pastikanTerbuka(tanggal);
      const id = newId('KLR');
      await db.query(
        'INSERT INTO pengeluaran (id, tanggal, kategori, uraian, nominal, bukti, sumber, petugas) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [id, tanggal, kategori, uraian, nominal, bukti, sumber, user.username]
      );
      require('./_lib/cache-publik').invalidatePublik();
      await catat(user, 'PENGELUARAN', `Pengeluaran "${uraian}" (${kategori}) Rp ${nominal} dari ${NAMA_DANA[sumber]} (${id}).`, req);
      return { id, sumber };
    }
  },
  // Ubah pengeluaran yang salah catat (tanggal, kategori, uraian, nominal, bukti). Dana asal tidak berubah.
  PUT: {
    auth: butuh('pengeluaran.tulis'),
    fn: async (req, res, user) => {
      const b = req.body || {};
      const id = str(b.id, 'ID', { max: 40, required: true });
      const p = (await db.query('SELECT id, status, tanggal, kategori, uraian, nominal, bukti, sumber FROM pengeluaran WHERE id = ?', [id])).rows[0];
      if (!p) throw fail(404, 'Pengeluaran tidak ditemukan.');
      if (!bolehUbah(user, p)) throw fail(403, `Pengeluaran ini berasal dari ${NAMA_DANA[p.sumber]} dan tidak dapat diubah oleh peran Anda.`);
      const today = P.todayWIB();
      const tanggal = b.tanggal !== undefined ? String(b.tanggal) : String(p.tanggal).slice(0, 10);
      if (!P.validDate(tanggal)) throw fail(400, 'Tanggal tidak valid.');
      if (tanggal > today) throw fail(400, 'Tanggal tidak boleh di masa depan.');
      const kategori = b.kategori !== undefined ? str(b.kategori, 'Kategori', { max: 100, required: true }) : p.kategori;
      const uraian = b.uraian !== undefined ? str(b.uraian, 'Uraian', { max: 255, min: 3, required: true }) : p.uraian;
      const nominal = b.nominal !== undefined ? int(b.nominal, 'Nominal', { min: 1, max: 1000000000 }) : p.nominal;
      const bukti = b.bukti !== undefined ? (str(b.bukti, 'Bukti', { max: 100 }) || null) : p.bukti;
      await pastikanTerbuka(String(p.tanggal).slice(0, 10)); // data lama di buku yang sudah ditutup tidak boleh diubah
      await pastikanTerbuka(tanggal);                        // dan tidak boleh dipindah ke buku yang sudah ditutup
      await db.query(
        'UPDATE pengeluaran SET tanggal = ?, kategori = ?, uraian = ?, nominal = ?, bukti = ? WHERE id = ?',
        [tanggal, kategori, uraian, nominal, bukti, id]
      );
      require('./_lib/cache-publik').invalidatePublik();
      await catat(user, 'UBAH_PENGELUARAN',
        `Mengubah pengeluaran ${id} (${NAMA_DANA[p.sumber]}): [${String(p.tanggal).slice(0, 10)} | ${p.kategori} | ${p.uraian} | Rp ${p.nominal}] → [${tanggal} | ${kategori} | ${uraian} | Rp ${nominal}].`, req);
      return { id };
    }
  },

  // Hapus pengeluaran (permanen; alasan wajib; isi lengkap tersimpan di log aktivitas)
  DELETE: {
    auth: butuh('pengeluaran.tulis'),
    fn: async (req, res, user) => {
      const q = req.query || {};
      const id = str(q.id, 'ID', { max: 40, required: true });
      const alasan = str(q.alasan, 'Alasan penghapusan', { min: 3, max: 255, required: true });
      const p = (await db.query('SELECT id, status, tanggal, kategori, uraian, nominal, bukti, sumber, petugas FROM pengeluaran WHERE id = ?', [id])).rows[0];
      if (!p) throw fail(404, 'Pengeluaran tidak ditemukan.');
      if (!bolehUbah(user, p)) throw fail(403, `Pengeluaran ini berasal dari ${NAMA_DANA[p.sumber]} dan tidak dapat dihapus oleh peran Anda.`);
      await pastikanTerbuka(String(p.tanggal).slice(0, 10));
      await db.query('DELETE FROM pengeluaran WHERE id = ?', [id]);
      require('./_lib/cache-publik').invalidatePublik();
      await catat(user, 'HAPUS_PENGELUARAN',
        `Menghapus pengeluaran ${id} [${String(p.tanggal).slice(0, 10)} | ${p.kategori} | ${p.uraian} | Rp ${p.nominal} | ${p.sumber} | bukti ${p.bukti || '-'} | dicatat ${p.petugas} | ${p.status}]: ${alasan}`, req);
      return { id };
    }
  }
});
