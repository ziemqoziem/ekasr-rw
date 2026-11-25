const db = require('./db');
const { route, fail, str, int, oneOf, scopeRt, cekRtWarga, RT_LIST, butuh } = require('./_lib/http');
const { catat } = require('./_lib/util');
const I = require('./_lib/iuran');
const P = require('./_lib/periode');
const { pastikanTerbuka } = require('./_lib/tutupbuku');

async function ambilWarga(id) {
  const w = (await db.query('SELECT id, nama, rt, jenis, aktif, mulai_iuran, berhenti_pada, ikut_jimpitan, jimpitan_berhenti, ikut_iuran, iuran_berhenti FROM warga WHERE id = ?', [id])).rows[0];
  if (!w) throw fail(404, 'Warga tidak ditemukan.');
  return w;
}
const ringkasWarga = (s) => s ? {
  kurang: s.kurang, tagihan_berjalan: s.tagihan_berjalan, lebih: s.lebih, periode_kurang: s.periode_kurang, periode_lebih: s.periode_lebih
} : null;

module.exports = route({
  /**
   * Papan iuran wajib untuk satu periode kumpulan (default: periode berjalan).
   * Status per warga: lunas | sebagian | belum (hasil alokasi pembayaran ke periode tertua dulu).
   */
  GET: {
    auth: butuh('iuran.lihat'),
    fn: async (req, res, user) => {
      const q = req.query || {};
      const ctx = await I.bangunKonteksIuran();
      const sekarang = I.periodeDari(ctx.today);
      let periode = sekarang;
      if (q.periode) {
        if (!P.validDate(String(q.periode))) throw fail(400, 'Periode tidak valid.');
        periode = I.periodeDari(String(q.periode));
        if (periode.mulai > sekarang.mulai) periode = sekarang;
      }
      // Pilihan periode: dari periode penagihan pertama sampai berjalan (maks. 40), terbaru di atas
      const awalTagih = ctx.iuranMulai ? I.periodePertama(ctx.iuranMulai).mulai : null;
      const daftarPeriode = [];
      for (let p = sekarang; daftarPeriode.length < 40; p = I.periodeSebelum(p)) {
        if (awalTagih && p.mulai < awalTagih && daftarPeriode.length >= 3) break;
        daftarPeriode.push({ ...p, weton: I.weton(p.mulai), berjalan: p.mulai === sekarang.mulai });
        if (!awalTagih && daftarPeriode.length >= 8) break;
      }
      // K1 = tertua … Kn = terbaru (daftar terbaru di atas)
      const nPer = daftarPeriode.length;
      daftarPeriode.forEach((p, i) => { p.no = nPer - i; });
      const info = {
        mulai: periode.mulai, akhir: periode.akhir, weton: I.weton(periode.mulai),
        berjalan: periode.mulai === sekarang.mulai,
        no: (daftarPeriode.find((x) => x.mulai === periode.mulai) || {}).no || null
      };
      if (!ctx.aktif) {
        return { aktif: false, pesan: 'Iuran wajib belum diaktifkan. Admin perlu mengisi nominal iuran dan tanggal mulai penagihan di Pengaturan → Iuran Wajib.', periode: info, periode_daftar: daftarPeriode, warga: [] };
      }
      const rt = scopeRt(user, q.rt ? oneOf(String(q.rt), 'RT', RT_LIST) : null);
      const where = ['aktif = 1', '(ikut_iuran = 1 OR iuran_berhenti IS NOT NULL)'];
      const params = [];
      if (rt) { where.push('rt = ?'); params.push(rt); }
      const wr = await db.query(
        `SELECT id, nama, rt, jenis, no_hp, mulai_iuran, berhenti_pada, ikut_jimpitan, jimpitan_berhenti, ikut_iuran, iuran_berhenti FROM warga WHERE ${where.join(' AND ')} ORDER BY rt, id`, params
      );
      const hit = I.hitungIuran(wr.rows, ctx);
      const nominalPeriode = I.nominalPada(ctx.tarif, periode.mulai);
      const bayarPeriode = await db.query(
        "SELECT warga_id, id, nominal FROM iuran_wajib WHERE status = 'sah' AND tanggal BETWEEN ? AND ?", [periode.mulai, periode.akhir]
      );
      const pb = new Map();
      for (const x of bayarPeriode.rows) { if (!pb.has(x.warga_id)) pb.set(x.warga_id, []); pb.get(x.warga_id).push({ id: x.id, nominal: x.nominal }); }
      // Riwayat = semua kumpulan sejak penagihan dimulai SAMPAI kumpulan terpilih di filter (satu kolom per kumpulan)
      const enam = [];
      for (let p = periode; enam.length < 60; p = I.periodeSebelum(p)) {
        if (awalTagih && p.mulai < awalTagih) break;
        enam.unshift({ mulai: p.mulai, akhir: p.akhir });
        if (!awalTagih && enam.length >= 6) break;
      }
      // Batasi ke warga di papan + sejak awal penagihan (hindari full-table scan)
      const sm = new Map();
      const idWarga = wr.rows.map((w) => w.id);
      if (idWarga.length) {
        const tglMin = awalTagih || ctx.iuranMulai || '2020-01-01';
        const ph = idWarga.map(() => '?').join(',');
        const semuaSetor = await db.query(
          `SELECT warga_id, id, tanggal, nominal FROM iuran_wajib
           WHERE status = 'sah' AND tanggal >= ? AND warga_id IN (${ph})
           ORDER BY tanggal, created_at`,
          [tglMin, ...idWarga]
        );
        for (const x of semuaSetor.rows) {
          if (!sm.has(x.warga_id)) sm.set(x.warga_id, []);
          sm.get(x.warga_id).push({ id: x.id, tanggal: String(x.tanggal).slice(0, 10), nominal: x.nominal });
        }
      }

      const cnt = { lunas: 0, sebagian: 0, belum: 0, luar: 0 };
      let totalKurang = 0, masukPeriode = 0;
      const rows = wr.rows.map((w) => {
        const s = hit.get(w.id);
        const p = s ? s.periode.find((x) => x.mulai === periode.mulai) : null;
        const status = p ? p.status : 'luar';
        cnt[status] += 1;
        if (s) totalKurang += s.kurang;
        const list = pb.get(w.id) || [];
        const totalP = list.reduce((a, x) => a + x.nominal, 0);
        masukPeriode += totalP;
        const riwayat = enam.map((e) => { const x = s && s.periode.find((y) => y.mulai === e.mulai); return { mulai: e.mulai, status: x ? x.status : 'luar' }; });
        return {
          id: w.id, nama: w.nama, rt: w.rt, jenis: w.jenis, no_hp: w.no_hp, status, nominal: p ? p.nominal : 0,
          dibayar_periode: p ? p.dibayar : 0, ...ringkasWarga(s), saran: s && s.tagihan_berjalan > 0 ? s.tagihan_berjalan : nominalPeriode,
          setoran: list, total_diterima: totalP, riwayat,
          total_setor: s ? s.terbayar : 0, setoran_semua: sm.get(w.id) || []
        };
      });
      return {
        aktif: true, periode: info, periode_daftar: daftarPeriode, nominal: nominalPeriode, nominal_sekarang: ctx.nominalNow,
        ringkasan: { total_warga: rows.length, ...cnt, total_masuk: masukPeriode, total_kurang: totalKurang },
        kolom: enam.map((e, i) => ({ mulai: e.mulai, akhir: e.akhir, no: i + 1, terpilih: e.mulai === periode.mulai })),
        warga: rows
      };
    }
  },

  POST: {
    auth: butuh('iuran.tulis'),
    status: 201,
    fn: async (req, res, user) => {
      const b = req.body || {};
      const warga = await ambilWarga(int(b.warga_id, 'Warga', { min: 1 }));
      cekRtWarga(user, warga.rt);
      if (!warga.aktif) throw fail(400, 'Warga ini sudah nonaktif.');
      const today = P.todayWIB();
      const tanggal = b.tanggal ? String(b.tanggal) : today;
      if (!P.validDate(tanggal)) throw fail(400, 'Tanggal tidak valid.');
      if (tanggal > today) throw fail(400, 'Tanggal tidak boleh di masa depan.');
      const catatan = str(b.catatan, 'Catatan', { max: 255 }) || null;
      const h = await I.simpanIuran({ user, warga, tanggal, nominal: b.nominal, metode: b.metode, catatan, abaikanDuplikat: !!b.abaikan_duplikat });
      await catat(user, 'IURAN_WAJIB', `Iuran wajib ${warga.nama} (RT ${warga.rt}) Rp ${h.nominal} tanggal ${tanggal} (${h.id}).`, req);
      const ctx = await I.bangunKonteksIuran();
      return { id: h.id, nominal: h.nominal, ringkasan: ringkasWarga(I.hitungIuran([warga], ctx).get(warga.id)) };
    }
  },

  // Batalkan (tidak dihapus; tercatat alasan). Alokasi periode dihitung ulang otomatis.
  PUT: {
    auth: butuh('iuran.tulis'),
    fn: async (req, res, user) => {
      const b = req.body || {};
      const id = str(b.id, 'ID', { max: 40, required: true });
      const alasan = str(b.alasan, 'Alasan pembatalan', { min: 3, max: 255, required: true });
      const s = (await db.query(
        'SELECT i.id, i.status, i.nominal, i.tanggal, w.nama, w.rt FROM iuran_wajib i JOIN warga w ON w.id = i.warga_id WHERE i.id = ?', [id]
      )).rows[0];
      if (!s) throw fail(404, 'Data tidak ditemukan.');
      if (s.status === 'batal') throw fail(400, 'Sudah dibatalkan.');
      cekRtWarga(user, s.rt);
      await pastikanTerbuka(s.tanggal);
      await db.query("UPDATE iuran_wajib SET status = 'batal', alasan_batal = ? WHERE id = ?", [alasan, id]);
      require('./_lib/cache-publik').invalidatePublik();
      await catat(user, 'BATAL_IURAN_WAJIB', `Membatalkan iuran wajib ${id} (${s.nama}, Rp ${s.nominal}): ${alasan}`, req);
      return { id };
    }
  }
});
