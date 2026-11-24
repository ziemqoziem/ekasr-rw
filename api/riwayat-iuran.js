const db = require('./db');
const { route, oneOf, scopeRt, RT_LIST, butuh } = require('./_lib/http');

const num = (v) => Number(v || 0);

/**
 * RIWAYAT IURAN WAJIB (semua pembayaran, terbaru di atas).
 *   GET ?rt=007|008|009 (kosong = semua RT)  &q=nama  &status=sah|batal
 * Hasil: daftar pembayaran + total per RT (hanya yang sah) untuk label tab.
 */
module.exports = route({
  GET: {
    auth: butuh('iuran.lihat'),
    fn: async (req, res, user) => {
      const q = req.query || {};
      const rt = scopeRt(user, q.rt ? oneOf(String(q.rt), 'RT', RT_LIST) : null);
      const status = q.status === 'sah' || q.status === 'batal' ? q.status : '';
      const cari = String(q.q || '').trim().slice(0, 60);

      const where = [];
      const prm = [];
      if (rt) { where.push('w.rt = ?'); prm.push(rt); }
      if (status) { where.push('i.status = ?'); prm.push(status); }
      if (cari) { where.push('w.nama LIKE ?'); prm.push('%' + cari.replace(/[%_\\]/g, '\\$&') + '%'); }
      const r = await db.query(
        `SELECT i.id, i.tanggal, i.nominal, i.metode, i.petugas, i.catatan, i.status, i.alasan_batal, w.id AS warga_id, w.nama, w.rt
         FROM iuran_wajib i JOIN warga w ON w.id = i.warga_id
         ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
         ORDER BY i.tanggal DESC, i.created_at DESC LIMIT 1000`, prm);

      // Total per RT (sah) tanpa memperhatikan filter RT/pencarian, untuk label tab
      const batas = scopeRt(user, null);
      const t = await db.query(
        `SELECT w.rt, COUNT(*) AS c, COALESCE(SUM(i.nominal), 0) AS n
         FROM iuran_wajib i JOIN warga w ON w.id = i.warga_id
         WHERE i.status = 'sah' ${batas ? 'AND w.rt = ?' : ''} GROUP BY w.rt ORDER BY w.rt`, batas ? [batas] : []);
      const perRt = t.rows.map((x) => ({ rt: x.rt, jumlah: num(x.c), total: num(x.n) }));

      const riwayat = r.rows.map((x) => ({
        id: x.id, tanggal: String(x.tanggal).slice(0, 10), nominal: num(x.nominal), petugas: x.petugas, catatan: x.catatan,
        status: x.status, alasan_batal: x.alasan_batal, warga_id: x.warga_id, nama: x.nama, rt: x.rt
      }));
      const sah = riwayat.filter((x) => x.status === 'sah');
      return {
        riwayat, per_rt: perRt,
        ringkasan: { jumlah: sah.length, total: sah.reduce((a, x) => a + x.nominal, 0), batal: riwayat.length - sah.length },
        terpotong: r.rows.length >= 1000
      };
    }
  }
});
