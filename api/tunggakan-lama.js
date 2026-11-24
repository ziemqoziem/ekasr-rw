const db = require('./db');
const { route, fail, str, int, butuh } = require('./_lib/http');
const { catat } = require('./_lib/util');

const MAX_IMPOR = 500;

async function wargaAda(id) {
  const r = await db.query('SELECT id, nama FROM warga WHERE id = ?', [id]);
  return r.rows[0] || null;
}

module.exports = route({
  // Tambah manual {warga_id, tahun, nominal, keterangan}
  // atau impor massal {action:'impor', rows:[{warga_id, tahun, nominal, keterangan}]}
  POST: {
    auth: butuh('saldoawal.kelola'),
    status: 201,
    fn: async (req, res, user) => {
      const b = req.body || {};

      if (b.action === 'impor') {
        if (!Array.isArray(b.rows) || !b.rows.length) throw fail(400, 'Tidak ada baris untuk diimpor.');
        if (b.rows.length > MAX_IMPOR) throw fail(400, `Maksimal ${MAX_IMPOR} baris per impor.`);
        const ok = [];
        const gagal = [];
        for (let i = 0; i < b.rows.length; i++) {
          const row = b.rows[i] || {};
          try {
            const wid = int(row.warga_id, 'No/ID warga', { min: 1 });
            const tahun = int(row.tahun, 'Tahun', { min: 2000, max: 2100 });
            const nominal = int(row.nominal, 'Nominal', { min: 1, max: 100000000 });
            const ket = str(row.keterangan, 'Keterangan', { max: 255 }) || `Tunggakan tahun ${tahun} (impor)`;
            const w = await wargaAda(wid);
            if (!w) throw fail(400, `Warga dengan No ${wid} tidak ada.`);
            await db.query(
              `INSERT INTO tunggakan_lama (warga_id, tahun, nominal, keterangan, sumber, dibuat_oleh)
               VALUES (?, ?, ?, ?, 'impor', ?)`,
              [wid, tahun, nominal, ket, user.username]
            );
            ok.push(wid);
          } catch (e) {
            if (e && e.status) gagal.push({ baris: i + 1, alasan: e.message });
            else throw e;
          }
        }
        await catat(user, 'IMPOR_TUNGGAKAN', `Impor tunggakan lama: ${ok.length} berhasil, ${gagal.length} gagal.`, req);
        return { berhasil: ok.length, gagal };
      }

      const wid = int(b.warga_id, 'Warga', { min: 1 });
      const tahun = int(b.tahun, 'Tahun', { min: 2000, max: 2100 });
      const nominal = int(b.nominal, 'Nominal', { min: 1, max: 100000000 });
      const ket = str(b.keterangan, 'Keterangan', { max: 255 }) || `Tunggakan tahun ${tahun}`;
      const w = await wargaAda(wid);
      if (!w) throw fail(404, 'Warga tidak ditemukan.');
      const r = await db.query(
        `INSERT INTO tunggakan_lama (warga_id, tahun, nominal, keterangan, sumber, dibuat_oleh)
         VALUES (?, ?, ?, ?, 'manual', ?)`,
        [wid, tahun, nominal, ket, user.username]
      );
      await catat(user, 'TUNGGAKAN_LAMA', `Menambah tunggakan lama ${w.nama} tahun ${tahun} Rp ${nominal}.`, req);
      return { id: r.insertId };
    }
  },

  // Batalkan tunggakan lama (saldo warga otomatis dihitung ulang)
  DELETE: {
    auth: butuh('saldoawal.kelola'),
    fn: async (req, res, user) => {
      const id = int((req.query || {}).id || (req.body || {}).id, 'ID', { min: 1 });
      const t = (await db.query(
        `SELECT t.id, t.nominal, w.nama FROM tunggakan_lama t JOIN warga w ON w.id = t.warga_id WHERE t.id = ? AND t.status = 'aktif'`, [id]
      )).rows[0];
      if (!t) throw fail(404, 'Tunggakan lama tidak ditemukan.');
      await db.query("UPDATE tunggakan_lama SET status = 'batal' WHERE id = ?", [id]);
      await catat(user, 'BATAL_TUNGGAKAN_LAMA', `Membatalkan tunggakan lama #${id} (${t.nama}, Rp ${t.nominal}).`, req);
      return { id };
    }
  }
});
