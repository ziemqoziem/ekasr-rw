const db = require('./db');
const { route, fail, str, int, oneOf, RT_LIST, butuh } = require('./_lib/http');
const { punya, peranTerbatasRt } = require('./_lib/izin');
const { catat, newId } = require('./_lib/util');
const I = require('./_lib/iuran');
const P = require('./_lib/periode');
const { pastikanTerbuka } = require('./_lib/tutupbuku');

/**
 * Pendapatan sewa aset: hanya PENERIMAAN (tanpa data penyewa/piutang).
 * Pengurus RT: hanya RT-nya. Bendahara RW: semua RT (dan RW umum). Admin: hanya melihat.
 * Laporan dikelompokkan per periode kumpulan (Selasa Kliwon).
 */
// Peran "dibatasi RT": hanya RT yang tertera pada akunnya
const terbatasRt = (user) => peranTerbatasRt(user.role);
const rtBatas = (user) => (terbatasRt(user) ? user.rt : null);

module.exports = route({
  GET: {
    auth: butuh('sewa.lihat'),
    fn: async (req, res, user) => {
      const q = req.query || {};
      const batas = rtBatas(user);
      if (terbatasRt(user) && !batas) throw fail(403, 'Akun pengurus RT belum diatur RT-nya. Hubungi admin.');
      const today = P.todayWIB();
      const per = q.periode && P.validDate(String(q.periode)) ? I.periodeDari(String(q.periode)) : null;
      const where = [];
      const params = [];
      if (batas) { where.push('rt = ?'); params.push(batas); }
      else if (q.rt) { where.push('rt = ?'); params.push(oneOf(String(q.rt), 'RT', RT_LIST)); }
      if (per) { where.push('tanggal BETWEEN ? AND ?'); params.push(per.mulai, per.akhir); }
      const r = await db.query(
        `SELECT id, tanggal, rt, uraian, nominal, metode, petugas, catatan, status, alasan_batal
         FROM sewa_aset ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
         ORDER BY tanggal DESC, created_at DESC LIMIT 500`, params
      );
      // Rekap 6 periode kumpulan terakhir (sesuai batas RT)
      const enam = I.periodeTerakhir(today, 6);
      const rekap = [];
      for (const p of enam) {
        const wh = ["status = 'sah'", 'tanggal BETWEEN ? AND ?'];
        const pr = [p.mulai, p.akhir];
        if (batas) { wh.push('rt = ?'); pr.push(batas); }
        const t = (await db.query(`SELECT COALESCE(SUM(nominal), 0) AS n, COUNT(*) AS c FROM sewa_aset WHERE ${wh.join(' AND ')}`, pr)).rows[0];
        rekap.push({ mulai: p.mulai, akhir: p.akhir, weton: I.weton(p.mulai), berjalan: p.mulai === I.periodeDari(today).mulai, total: Number(t.n), jumlah: Number(t.c) });
      }
      return {
        sewa: r.rows.map((x) => ({ ...x, tanggal: String(x.tanggal).slice(0, 10) })),
        rekap, batas_rt: batas, bisa_tulis: punya(user, 'sewa.tulis')
      };
    }
  },

  POST: {
    auth: butuh('sewa.tulis'),
    status: 201,
    fn: async (req, res, user) => {
      const b = req.body || {};
      const today = P.todayWIB();
      const tanggal = b.tanggal ? String(b.tanggal) : today;
      if (!P.validDate(tanggal)) throw fail(400, 'Tanggal tidak valid.');
      if (tanggal > today) throw fail(400, 'Tanggal tidak boleh di masa depan.');
      const uraian = str(b.uraian, 'Uraian', { min: 3, max: 200, required: true });
      const nominal = int(b.nominal, 'Nominal', { min: 1, max: 1000000000 });
      const catatan = str(b.catatan, 'Catatan', { max: 255 }) || null;
      const metode = ['tunai', 'transfer'].includes(b.metode) ? b.metode : 'tunai';
      let rt;
      if (terbatasRt(user)) {
        if (!user.rt) throw fail(403, 'Akun pengurus RT belum diatur RT-nya. Hubungi admin.');
        rt = user.rt;
      } else {
        rt = b.rt ? oneOf(String(b.rt), 'RT', RT_LIST) : null; // kosong = aset RW
      }
      await pastikanTerbuka(tanggal);
      const id = newId('SWA');
      await db.query(
        'INSERT INTO sewa_aset (id, tanggal, rt, uraian, nominal, metode, petugas, catatan) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [id, tanggal, rt, uraian, nominal, metode, user.username, catatan]
      );
      await catat(user, 'SEWA_ASET', `Penerimaan sewa "${uraian}"${rt ? ' RT ' + rt : ''} Rp ${nominal} tanggal ${tanggal} (${id}).`, req);
      return { id };
    }
  },

  PUT: {
    auth: butuh('sewa.tulis'),
    fn: async (req, res, user) => {
      const b = req.body || {};
      const id = str(b.id, 'ID', { max: 40, required: true });
      const alasan = str(b.alasan, 'Alasan pembatalan', { min: 3, max: 255, required: true });
      const s = (await db.query('SELECT id, status, rt, tanggal, uraian, nominal FROM sewa_aset WHERE id = ?', [id])).rows[0];
      if (!s) throw fail(404, 'Data tidak ditemukan.');
      if (s.status === 'batal') throw fail(400, 'Sudah dibatalkan.');
      if (terbatasRt(user) && s.rt !== user.rt) throw fail(403, 'Anda hanya dapat mengelola data RT Anda sendiri.');
      await pastikanTerbuka(s.tanggal);
      await db.query("UPDATE sewa_aset SET status = 'batal', alasan_batal = ? WHERE id = ?", [alasan, id]);
      await catat(user, 'BATAL_SEWA_ASET', `Membatalkan penerimaan sewa ${id} ("${s.uraian}", Rp ${s.nominal}): ${alasan}`, req);
      return { id };
    }
  }
});
