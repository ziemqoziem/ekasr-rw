const db = require('./db');
const { route, fail, int, butuh, cekRtWarga } = require('./_lib/http');
const { bangunKonteks, hitungSaldo } = require('./_lib/util');
const I = require('./_lib/iuran');

// Saldo satu warga + 30 setoran terakhir
module.exports = route({
  GET: {
    auth: butuh('jimpitan.lihat'),
    fn: async (req, res, user) => {
      const id = int((req.query || {}).warga_id, 'Warga', { min: 1 });
      const w = (await db.query('SELECT id, nama, rt, jenis, aktif, mulai_iuran, berhenti_pada, ikut_jimpitan, jimpitan_berhenti, ikut_iuran, iuran_berhenti FROM warga WHERE id = ?', [id])).rows[0];
      if (!w) throw fail(404, 'Warga tidak ditemukan.');
      cekRtWarga(user, w.rt);
      const ctx = await bangunKonteks();
      const s = hitungSaldo([w], ctx).get(w.id);
      const r = await db.query(
        `SELECT id, tanggal, nominal, metode, petugas, catatan, status, alasan_batal FROM setoran
         WHERE warga_id = ? ORDER BY tanggal DESC, created_at DESC LIMIT 30`, [id]
      );
      // Riwayat iuran wajib (kas RW) warga ini
      const iu = await db.query(
        `SELECT id, tanggal, nominal, petugas, status, alasan_batal FROM iuran_wajib
         WHERE warga_id = ? ORDER BY tanggal DESC, created_at DESC LIMIT 30`, [id]
      );
      const iuranSah = (await db.query(
        "SELECT COALESCE(SUM(nominal), 0) AS n, COUNT(*) AS c FROM iuran_wajib WHERE warga_id = ? AND status = 'sah'", [id]
      )).rows[0];
      // Kekurangan / kelebihan iuran wajib (alokasi pembayaran ke kumpulan tertua dulu)
      let iuranHitung = { aktif: false };
      try {
        const ci = await I.bangunKonteksIuran();
        const h = ci.iuranMulai ? I.hitungIuran([w], ci).get(w.id) : null;
        if (h) {
          iuranHitung = {
            aktif: true, bebas: !!h.bebas, nominal_sekarang: ci.nominalNow, terbayar: h.terbayar, kewajiban: h.kewajiban, saldo: h.saldo,
            kurang: h.kurang, lebih: h.lebih, tagihan_berjalan: h.tagihan_berjalan, periode_kurang: h.periode_kurang, periode_lebih: h.periode_lebih,
            periode: h.periode.map((x, i) => ({ no: i + 1, mulai: x.mulai, akhir: x.akhir, nominal: x.nominal, dibayar: x.dibayar, status: x.status, selesai: x.selesai }))
          };
        }
      } catch (e) { iuranHitung = { aktif: false }; }
      return {
        iuran_hitung: iuranHitung,
        iuran: iu.rows.map((x) => ({ ...x, nominal: Number(x.nominal), tanggal: String(x.tanggal).slice(0, 10) })),
        iuran_total: { jumlah: Number(iuranSah.c), total: Number(iuranSah.n), ikut: !!w.ikut_iuran },
        warga: { id: w.id, nama: w.nama, rt: w.rt, jenis: w.jenis },
        tarif_harian: ctx.tarifNow, mulai_hitung: ctx.mulaiHitung,
        saldo: s, setoran: r.rows.map((x) => ({ ...x, tanggal: String(x.tanggal).slice(0, 10) }))
      };
    }
  }
});
