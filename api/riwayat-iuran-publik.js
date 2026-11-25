const db = require('./db');
const { route, fail, str, oneOf, RT_LIST } = require('./_lib/http');
const { getPengaturan } = require('./_lib/util');
const I = require('./_lib/iuran');

/**
 * Riwayat iuran wajib (kas RW) PUBLIK satu warga (nama + RT persis, dari hasil cek):
 *   periode   = status tiap kumpulan RW (lunas/sebagian/belum) + nominal dibayar, kumpulan terbaru di atas
 *   transaksi = 200 pembayaran sah terakhir (tanggal + nominal, tanpa petugas/catatan)
 * Dibatasi per IP dan ikut saklar cek_tunggakan_publik.
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
      const pg = await getPengaturan();
      if (pg.cek_tunggakan_publik === '0') throw fail(403, 'Fitur ini sedang dinonaktifkan oleh pengurus.');
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
      const ctx = await I.bangunKonteksIuran();
      if (!ctx.aktif) throw fail(404, 'Iuran wajib belum diaktifkan.');
      const h = I.hitungIuran([w], ctx).get(w.id);
      if (!h) throw fail(404, 'Data iuran tidak tersedia.');
      const trx = (await db.query(
        "SELECT tanggal, nominal FROM iuran_wajib WHERE warga_id = ? AND status = 'sah' ORDER BY tanggal DESC, created_at DESC LIMIT 200", [w.id]
      )).rows.map((x) => ({ tanggal: String(x.tanggal).slice(0, 10), nominal: Number(x.nominal) }));
      return {
        warga: { nama: w.nama, rt: w.rt, jenis: w.jenis },
        bebas: !!h.bebas, nominal: ctx.nominalNow, terbayar: h.terbayar, kewajiban: h.kewajiban, saldo: h.saldo,
        kurang: h.kurang, lebih: h.lebih, tagihan_berjalan: h.tagihan_berjalan, periode_kurang: h.periode_kurang, periode_lebih: h.periode_lebih,
        periode: h.periode.map((x, i) => ({ no: i + 1, mulai: x.mulai, akhir: x.akhir, nominal: x.nominal, dibayar: x.dibayar, status: x.status, selesai: x.selesai })).reverse().slice(0, 24),
        transaksi: trx
      };
    }
  }
});
