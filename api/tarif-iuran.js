const db = require('./db');
const { route, fail, int, butuh } = require('./_lib/http');
const { catat } = require('./_lib/util');
const P = require('./_lib/periode');

// Nominal iuran wajib per periode kumpulan (bertingkat menurut tanggal berlaku; diatur admin)
const SQL_LIST = 'SELECT id, nominal, berlaku_mulai FROM tarif_iuran ORDER BY berlaku_mulai DESC';

module.exports = route({
  GET: {
    auth: butuh('iuran.lihat'),
    fn: async () => ({ tarif: (await db.query(SQL_LIST)).rows })
  },
  POST: {
    auth: butuh('sistem.kelola'),
    status: 201,
    fn: async (req, res, user) => {
      const b = req.body || {};
      const nominal = int(b.nominal, 'Nominal', { min: 1, max: 100000000 });
      const mulai = String(b.berlaku_mulai || '');
      if (!P.validDate(mulai)) throw fail(400, 'Tanggal berlaku tidak valid (format YYYY-MM-DD).');
      await db.query(
        'INSERT INTO tarif_iuran (nominal, berlaku_mulai) VALUES (?, ?) ON DUPLICATE KEY UPDATE nominal = VALUES(nominal)',
        [nominal, mulai]
      );
      await catat(user, 'TARIF_IURAN', `Iuran wajib Rp ${nominal} per periode berlaku mulai ${mulai}.`, req);
      return { tarif: (await db.query(SQL_LIST)).rows };
    }
  }
});
