const db = require('./db');
const { route, fail, str, int, butuh, cekRtWarga } = require('./_lib/http');
const { catat, bangunKonteks } = require('./_lib/util');
const { simpanSetoran, ringkasanSaldo, METODE } = require('./_lib/setoran');
const P = require('./_lib/periode');

const MAX_ITEMS = 300;

// Catat banyak setoran sekaligus; tiap baris punya NOMINAL sendiri.
module.exports = route({
  POST: {
    auth: butuh('jimpitan.tulis'),
    fn: async (req, res, user) => {
      const b = req.body || {};
      const today = P.todayWIB();
      const tanggal = b.tanggal ? String(b.tanggal) : today;
      if (!P.validDate(tanggal)) throw fail(400, 'Tanggal tidak valid.');
      if (tanggal > today) throw fail(400, 'Tanggal setoran tidak boleh di masa depan.');
      if (!Array.isArray(b.items) || !b.items.length) throw fail(400, 'Isi nominal minimal satu warga.');
      if (b.items.length > MAX_ITEMS) throw fail(400, `Maksimal ${MAX_ITEMS} warga per simpan.`);
      const metode = METODE.includes(b.metode) ? b.metode : 'tunai';
      const catatan = str(b.catatan, 'Catatan', { max: 255 }) || null;

      const ids = [...new Set(b.items.map((it) => int(it && it.warga_id, 'Warga', { min: 1 })))];
      const wr = await db.query(
        `SELECT id, nama, rt, jenis, aktif, mulai_iuran, berhenti_pada, ikut_jimpitan, jimpitan_berhenti, ikut_iuran, iuran_berhenti FROM warga WHERE id IN (${ids.map(() => '?').join(',')})`,
        ids
      );
      const byId = new Map(wr.rows.map((w) => [w.id, w]));

      const berhasil = [];
      const gagal = [];
      let total = 0;
      for (const it of b.items) {
        const w = byId.get(Number(it.warga_id));
        if (!w) { gagal.push({ warga_id: it.warga_id, alasan: 'Warga tidak ditemukan.' }); continue; }
        try {
          cekRtWarga(user, w.rt);
          if (!w.aktif) throw fail(400, `${w.nama}: warga nonaktif.`);
          const h = await simpanSetoran({ user, warga: w, tanggal, nominal: it.nominal, metode, catatan, abaikanDuplikat: !!b.abaikan_duplikat });
          berhasil.push({ warga_id: w.id, id: h.id, nominal: h.nominal });
          total += h.nominal;
        } catch (e) {
          if (e && e.status) gagal.push({ warga_id: w.id, alasan: e.message, kode: e.kode });
          else throw e;
        }
      }
      if (berhasil.length) {
        await catat(user, 'SETORAN_MASSAL', `Mencatat ${berhasil.length} setoran tanggal ${tanggal}, total Rp ${total}.`, req);
      }
      return { tersimpan: berhasil.length, total, berhasil, gagal };
    }
  }
});
