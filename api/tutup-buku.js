const db = require('./db');
const { route, fail, int, str, butuh } = require('./_lib/http');
const { catat } = require('./_lib/util');
const { totalKas } = require('./_lib/kas');
const { tahunDitutup } = require('./_lib/tutupbuku');
const P = require('./_lib/periode');

/**
 * TUTUP BUKU per 31 Desember.
 *  - Hanya tahun berikutnya setelah tahun terakhir yang ditutup (atau tahun saldo awal pertama), dan hanya setelah 31 Des lewat.
 *  - Saldo akhir tiap kantong (jimpitan, iuran wajib, pemasukan lainnya, umum) dicatat sebagai saldo awal tahun berikutnya.
 *  - Transaksi bertanggal s.d. 31 Des tahun itu terkunci (tidak bisa dicatat/dibatalkan) sampai admin membuka kembali.
 * Dicatat Bendahara RW; admin dapat membuka kembali tahun terakhir saja.
 */
async function status() {
  const today = P.todayWIB();
  const tahunNow = Number(today.slice(0, 4));
  const ditutup = await tahunDitutup();
  // Dasar kas = saldo awal yang diisi admin di Pengaturan (mis. 2026 = hasil tutup buku 2025). Bila ada beberapa, yang terbaru berlaku.
  const sa = await db.query("SELECT MAX(tahun) AS t FROM saldo_awal WHERE asal = 'manual'");
  const awal = sa.rows[0] && sa.rows[0].t !== null ? Number(sa.rows[0].t) : null;
  const terakhirTutup = ditutup.length ? ditutup[ditutup.length - 1] : null;
  const berikut = terakhirTutup !== null && (awal === null || terakhirTutup >= awal) ? terakhirTutup + 1 : awal;
  let boleh = false, alasan = null;
  if (berikut === null) alasan = 'Saldo awal kas belum diisi. Admin perlu mengisinya di Pengaturan → Saldo Awal Kas.';
  else if (berikut >= tahunNow) alasan = `Buku ${berikut} masih berjalan. Tutup buku ${berikut} baru dapat dilakukan setelah 31 Desember ${berikut}; saldonya otomatis menjadi saldo awal ${berikut + 1}.`;
  else boleh = true;
  // Saldo per 31 Des bila dapat ditutup; bila belum, tampilkan saldo sementara (sampai hari ini) sebagai gambaran
  const preview = boleh ? await totalKas(`${berikut}-12-31`) : null;
  const sementara = !boleh && berikut !== null ? await totalKas(today) : null;
  return { today, tahun_ditutup: ditutup, tahun_awal: awal, tahun_berikut: berikut, boleh, alasan, preview, sementara };
}

module.exports = route({
  GET: { auth: butuh('kas.lihat'), fn: async () => status() },

  POST: {
    auth: butuh('tutupbuku.tulis'),
    status: 201,
    fn: async (req, res, user) => {
      const b = req.body || {};
      const tahun = int(b.tahun, 'Tahun', { min: 2000, max: 2100 });
      const st = await status();
      if (!st.boleh) throw fail(400, st.alasan);
      if (tahun !== st.tahun_berikut) throw fail(400, `Tutup buku harus berurutan. Tahun yang dapat ditutup sekarang: ${st.tahun_berikut}.`);
      const catatan = str(b.catatan, 'Catatan', { max: 255 }) || null;
      const akhir = await totalKas(`${tahun}-12-31`);
      const ket = `Hasil tutup buku ${tahun} (saldo per 31 Desember ${tahun})`;
      const nilai = { jimpitan: akhir.jimpitan, iuran_wajib: akhir.iuran, sewa_aset: akhir.sewa, umum: akhir.umum };
      for (const [s, n] of Object.entries(nilai)) {
        await db.query(
          `INSERT INTO saldo_awal (tahun, sumber, nominal, asal, keterangan, dibuat_oleh) VALUES (?, ?, ?, 'tutup_buku', ?, ?)
           ON DUPLICATE KEY UPDATE nominal = VALUES(nominal), asal = 'tutup_buku', keterangan = VALUES(keterangan), dibuat_oleh = VALUES(dibuat_oleh)`,
          [tahun + 1, s, n, ket, user.username]
        );
      }
      await db.query('INSERT INTO tutup_buku (tahun, ditutup_oleh, catatan) VALUES (?, ?, ?)', [tahun, user.username, catatan]);
      await catat(user, 'TUTUP_BUKU', `Tutup buku ${tahun}: saldo akhir Rp ${akhir.saldo} (jimpitan ${akhir.jimpitan}, iuran ${akhir.iuran}, sewa ${akhir.sewa}, umum ${akhir.umum}).`, req);
      return { tahun, saldo_akhir: akhir.saldo, saldo_awal_berikut: nilai };
    }
  },

  // Buka kembali: hanya tahun TERAKHIR yang ditutup, oleh admin
  DELETE: {
    auth: butuh('tutupbuku.buka'),
    fn: async (req, res, user) => {
      const tahun = int((req.query || {}).tahun, 'Tahun', { min: 2000, max: 2100 });
      const ditutup = await tahunDitutup();
      if (!ditutup.length || ditutup[ditutup.length - 1] !== tahun) throw fail(400, 'Hanya tutup buku tahun terakhir yang dapat dibuka kembali.');
      await db.query('DELETE FROM tutup_buku WHERE tahun = ?', [tahun]);
      await db.query("DELETE FROM saldo_awal WHERE tahun = ? AND asal = 'tutup_buku'", [tahun + 1]);
      await catat(user, 'BUKA_TUTUP_BUKU', `Membuka kembali tutup buku ${tahun}; saldo awal ${tahun + 1} hasil tutup buku dihapus.`, req);
      return { tahun };
    }
  }
});
