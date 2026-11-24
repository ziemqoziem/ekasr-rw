const db = require('./db');
const { route, fail, str, butuh } = require('./_lib/http');
const { getPengaturan, catat } = require('./_lib/util');
const P = require('./_lib/periode');

// Kunci yang boleh diubah lewat API
const BOLEH = {
  nama_web: { max: 120 },
  subjudul: { max: 200 },
  ketua_rw: { max: 100 },
  nama_bendahara: { max: 100 },
  mulai_hitung: { tanggal: true },
  iuran_mulai: { tanggal: true, kosong: true },
  cek_tunggakan_publik: { bool: true }
};
const PUBLIK = ['nama_web', 'subjudul', 'cek_tunggakan_publik'];

module.exports = route({
  GET: {
    auth: 'public',
    fn: async (req, res, user) => {
      const all = await getPengaturan();
      if (!user) {
        const o = {};
        for (const k of PUBLIK) o[k] = all[k] || '';
        return { pengaturan: o };
      }
      return { pengaturan: all };
    }
  },
  PUT: {
    auth: butuh('sistem.kelola'),
    fn: async (req, res, user) => {
      const body = req.body || {};
      const ubah = [];
      for (const [k, rule] of Object.entries(BOLEH)) {
        if (body[k] === undefined) continue;
        let v;
        if (rule.bool) {
          v = body[k] === true || body[k] === '1' || body[k] === 1 ? '1' : '0';
        } else if (rule.tanggal) {
          v = str(body[k], k, { max: 10, required: !rule.kosong });
          if (v && !P.validDate(v)) throw fail(400, `Tanggal ${k === 'iuran_mulai' ? 'mulai penagihan iuran wajib' : 'mulai hitung'} tidak valid (format YYYY-MM-DD).`);
        } else {
          v = str(body[k], k, { max: rule.max, required: k === 'nama_web' });
        }
        ubah.push([k, v]);
      }
      if (!ubah.length) throw fail(400, 'Tidak ada pengaturan yang diubah.');
      for (const [k, v] of ubah) {
        await db.query(
          'INSERT INTO pengaturan (kunci, nilai) VALUES (?, ?) ON DUPLICATE KEY UPDATE nilai = VALUES(nilai)',
          [k, v]
        );
      }
      await catat(user, 'UBAH_PENGATURAN', `Mengubah pengaturan: ${ubah.map(([k, v]) => `${k}="${v}"`).join(', ')}`, req);
      return { pengaturan: await getPengaturan() };
    }
  }
});
