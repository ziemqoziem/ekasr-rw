const db = require('./db');
const { route, fail, int, str, butuh } = require('./_lib/http');
const { catat } = require('./_lib/util');
const { tahunDitutup } = require('./_lib/tutupbuku');

/**
 * Saldo awal kas per sumber (jimpitan, iuran wajib, pemasukan lainnya).
 * Diisi admin (data induk) untuk tahun buku pertama = saldo per 31 Des (tahun-1). Tahun berikutnya dibuat otomatis oleh Tutup Buku.
 */
const SUMBER = ['jimpitan', 'iuran_wajib', 'sewa_aset'];

module.exports = route({
  GET: {
    auth: butuh('kas.lihat'),
    fn: async () => {
      const r = await db.query('SELECT tahun, sumber, nominal, asal, keterangan, dibuat_oleh, created_at FROM saldo_awal ORDER BY tahun DESC, FIELD(sumber,\'jimpitan\',\'iuran_wajib\',\'sewa_aset\',\'umum\')');
      const per = {};
      for (const x of r.rows) {
        const t = (per[x.tahun] = per[x.tahun] || { tahun: Number(x.tahun), asal: x.asal, keterangan: x.keterangan, dibuat_oleh: x.dibuat_oleh, nominal: {} });
        t.nominal[x.sumber] = x.nominal;
      }
      return { saldo_awal: Object.values(per).sort((a, b) => b.tahun - a.tahun), tahun_ditutup: await tahunDitutup() };
    }
  },
  POST: {
    auth: butuh('saldokas.kelola'),
    status: 201,
    fn: async (req, res, user) => {
      const b = req.body || {};
      const tahun = int(b.tahun, 'Tahun', { min: 2000, max: 2100 });
      const ada = (await db.query('SELECT asal FROM saldo_awal WHERE tahun = ? LIMIT 1', [tahun])).rows[0];
      if (ada && ada.asal === 'tutup_buku') throw fail(400, `Saldo awal ${tahun} berasal dari Tutup Buku ${tahun - 1} dan tidak dapat diubah manual. Buka kembali tutup buku bila perlu.`);
      const ditutup = await tahunDitutup();
      if (ditutup.some((t) => t >= tahun)) throw fail(400, 'Saldo awal tidak dapat diubah: buku tahun tersebut sudah ditutup.');
      const ket = str(b.keterangan, 'Keterangan', { max: 255 }) || `Saldo awal kas per 31 Desember ${tahun - 1}`;
      const nilai = {};
      for (const s of SUMBER) nilai[s] = int(b[s] === undefined || b[s] === '' ? 0 : b[s], `Saldo ${s}`, { min: 0, max: 2000000000 });
      for (const s of SUMBER) {
        await db.query(
          `INSERT INTO saldo_awal (tahun, sumber, nominal, asal, keterangan, dibuat_oleh) VALUES (?, ?, ?, 'manual', ?, ?)
           ON DUPLICATE KEY UPDATE nominal = VALUES(nominal), keterangan = VALUES(keterangan), dibuat_oleh = VALUES(dibuat_oleh)`,
          [tahun, s, nilai[s], ket, user.username]
        );
      }
      await db.query("INSERT IGNORE INTO saldo_awal (tahun, sumber, nominal, asal, keterangan, dibuat_oleh) VALUES (?, 'umum', 0, 'manual', ?, ?)", [tahun, ket, user.username]);
      await catat(user, 'SALDO_AWAL', `Saldo awal kas ${tahun}: jimpitan Rp ${nilai.jimpitan}, iuran wajib Rp ${nilai.iuran_wajib}, pemasukan lainnya Rp ${nilai.sewa_aset}.`, req);
      return { tahun, nominal: nilai };
    }
  }
});
