const db = require('./db');
const { route, fail, str, int, butuh, cekRtWarga } = require('./_lib/http');
const { catat } = require('./_lib/util');
const { simpanIuran } = require('./_lib/iuran');
const P = require('./_lib/periode');

const MAX_ITEMS = 300;

// Catat iuran wajib banyak warga sekaligus; tiap baris punya NOMINAL sendiri.
module.exports = route({
  POST: {
    auth: butuh('iuran.tulis'),
    fn: async (req, res, user) => {
      const b = req.body || {};
      const today = P.todayWIB();
      const tanggal = b.tanggal ? String(b.tanggal) : today;
      if (!P.validDate(tanggal)) throw fail(400, 'Tanggal tidak valid.');
      if (tanggal > today) throw fail(400, 'Tanggal tidak boleh di masa depan.');
      if (!Array.isArray(b.items) || !b.items.length) throw fail(400, 'Isi nominal minimal satu warga.');
      if (b.items.length > MAX_ITEMS) throw fail(400, `Maksimal ${MAX_ITEMS} warga per simpan.`);
      const catatan = str(b.catatan, 'Catatan', { max: 255 }) || null;
      const ids = [...new Set(b.items.map((it) => int(it && it.warga_id, 'Warga', { min: 1 })))];
      const wr = await db.query(`SELECT id, nama, rt, aktif FROM warga WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
      const byId = new Map(wr.rows.map((w) => [w.id, w]));
      const berhasil = [], gagal = [];
      let total = 0;
      for (const it of b.items) {
        const w = byId.get(Number(it.warga_id));
        if (!w) { gagal.push({ warga_id: it.warga_id, alasan: 'Warga tidak ditemukan.' }); continue; }
        try {
          cekRtWarga(user, w.rt);
          if (!w.aktif) throw fail(400, `${w.nama}: warga nonaktif.`);
          const h = await simpanIuran({ user, warga: w, tanggal, nominal: it.nominal, metode: b.metode, catatan, abaikanDuplikat: !!b.abaikan_duplikat });
          berhasil.push({ warga_id: w.id, id: h.id, nominal: h.nominal });
          total += h.nominal;
        } catch (e) {
          if (e && e.status) gagal.push({ warga_id: w.id, alasan: e.message, kode: e.kode });
          else throw e;
        }
      }
      if (berhasil.length) await catat(user, 'IURAN_WAJIB_MASSAL', `Mencatat ${berhasil.length} iuran wajib tanggal ${tanggal}, total Rp ${total}.`, req);
      return { tersimpan: berhasil.length, total, berhasil, gagal };
    }
  }
});
