const db = require('./db');
const { route, fail, int, str, butuh } = require('./_lib/http');
const { catat } = require('./_lib/util');
const { tahunDitutup } = require('./_lib/tutupbuku');

/**
 * Saldo awal kas: dua kantong — Kas Jimpitan dan Kas RW.
 * Kas RW = iuran wajib + akumulasi kas aset / pemasukan lainnya (disimpan di sumber iuran_wajib; sewa_aset & umum = 0).
 * Diisi admin untuk tahun buku pertama = saldo per 31 Des (tahun-1). Tahun berikutnya otomatis dari Tutup Buku.
 */
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
      const list = Object.values(per).sort((a, b) => b.tahun - a.tahun).map((x) => {
        const n = x.nominal || {};
        const kas_rw = Number(n.iuran_wajib || 0) + Number(n.sewa_aset || 0) + Number(n.umum || 0);
        return { ...x, kas_jimpitan: Number(n.jimpitan || 0), kas_rw };
      });
      return { saldo_awal: list, tahun_ditutup: await tahunDitutup() };
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
      const jimpitan = int(b.jimpitan === undefined || b.jimpitan === '' ? 0 : b.jimpitan, 'Saldo Kas Jimpitan', { min: 0, max: 2000000000 });
      // Kas RW: field baru kas_rw, atau gabungan legacy iuran_wajib + sewa_aset
      let kasRw;
      if (b.kas_rw !== undefined && b.kas_rw !== '') {
        kasRw = int(b.kas_rw, 'Saldo Kas RW', { min: 0, max: 2000000000 });
      } else {
        const iuran = int(b.iuran_wajib === undefined || b.iuran_wajib === '' ? 0 : b.iuran_wajib, 'Saldo iuran wajib', { min: 0, max: 2000000000 });
        const sewa = int(b.sewa_aset === undefined || b.sewa_aset === '' ? 0 : b.sewa_aset, 'Saldo pemasukan lainnya', { min: 0, max: 2000000000 });
        kasRw = iuran + sewa;
      }
      const nilai = { jimpitan, iuran_wajib: kasRw, sewa_aset: 0, umum: 0 };
      for (const s of ['jimpitan', 'iuran_wajib', 'sewa_aset', 'umum']) {
        await db.query(
          `INSERT INTO saldo_awal (tahun, sumber, nominal, asal, keterangan, dibuat_oleh) VALUES (?, ?, ?, 'manual', ?, ?)
           ON DUPLICATE KEY UPDATE nominal = VALUES(nominal), keterangan = VALUES(keterangan), dibuat_oleh = VALUES(dibuat_oleh)`,
          [tahun, s, nilai[s], ket, user.username]
        );
      }
      require('./_lib/cache-publik').invalidatePublik();
      await catat(user, 'SALDO_AWAL', `Saldo awal kas ${tahun}: Kas Jimpitan Rp ${jimpitan}, Kas RW Rp ${kasRw}.`, req);
      return { tahun, nominal: nilai, kas_jimpitan: jimpitan, kas_rw: kasRw };
    }
  }
});
