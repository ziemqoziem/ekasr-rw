const db = require('./db');
const { route, fail, str, oneOf, RT_LIST } = require('./_lib/http');
const { bangunKonteks } = require('./_lib/util');
const { bangunKalender } = require('./_lib/kalender');

/**
 * Kalender setoran PUBLIK 3 bulan terakhir untuk satu warga (nama + RT persis, dari hasil cek tunggakan).
 * Privasi: hanya status hijau/merah, TANPA nominal setoran; dibatasi per IP; ikut saklar cek_tunggakan_publik.
 */
const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQ = 40;
const hits = new Map();
function boleh(ip) {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now - h.t0 > WINDOW_MS) { hits.set(ip, { t0: now, n: 1 }); return true; }
  h.n += 1;
  return h.n <= MAX_REQ;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of hits) if (now - v.t0 > WINDOW_MS) hits.delete(k);
}, WINDOW_MS).unref();

module.exports = route({
  GET: {
    auth: 'public',
    fn: async (req) => {
      const ctx = await bangunKonteks();
      if (ctx.pengaturan.cek_tunggakan_publik === '0') throw fail(403, 'Fitur ini sedang dinonaktifkan oleh pengurus.');
      if (!boleh(req.ip || '-')) throw fail(429, 'Terlalu banyak permintaan. Coba lagi beberapa menit lagi.');
      const q = req.query || {};
      const nama = str(q.nama, 'Nama', { max: 150, required: true });
      const rt = oneOf(String(q.rt || ''), 'RT', RT_LIST);
      const rows = (await db.query(
        'SELECT id, nama, rt, jenis, mulai_iuran, berhenti_pada, ikut_jimpitan, jimpitan_berhenti, ikut_iuran, iuran_berhenti FROM warga WHERE aktif = 1 AND nama = ? AND rt = ? LIMIT 2',
        [nama, rt]
      )).rows;
      if (rows.length !== 1) throw fail(404, 'Warga tidak ditemukan.');
      const w = rows[0];
      const k = await bangunKalender(w, ctx, ctx.today.slice(0, 7), 3, { nominal: false });
      return { warga: { nama: w.nama, rt: w.rt, jenis: w.jenis }, ...k };
    }
  }
});
