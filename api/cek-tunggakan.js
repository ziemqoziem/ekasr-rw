const db = require('./db');
const { route, fail, str, oneOf, RT_LIST } = require('./_lib/http');
const { bangunKonteks, hitungSaldo, batasProgram } = require('./_lib/util');
const { bangunKonteksIuran, hitungIuran } = require('./_lib/iuran');

/**
 * Cek saldo/tunggakan PUBLIK berdasarkan nama.
 * Pembatasan privasi: minimal 3 huruf, maksimal 8 hasil, tidak ada daftar/autocomplete,
 * tanpa no HP/alamat, dibatasi per IP, dan dapat dimatikan admin (pengaturan cek_tunggakan_publik = 0).
 */
const MAX_HASIL = 8;
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

// Ringkasan iuran wajib (kas RW) satu warga untuk publik: status periode berjalan, tunggakan/titipan, 6 periode terakhir
function iuranHasil(w, ctxI, hitI, lastI) {
  if (!ctxI || !ctxI.aktif) return null;                       // iuran wajib belum diaktifkan admin
  const h = hitI.get(w.id);
  if (!h) return null;
  if (h.bebas) return { bebas: true };
  const berjalan = h.periode.length && !h.periode[h.periode.length - 1].selesai ? h.periode[h.periode.length - 1] : null;
  return {
    nominal: ctxI.nominalNow,
    status_berjalan: berjalan ? berjalan.status : null,
    dibayar_berjalan: berjalan ? berjalan.dibayar : 0,
    kurang: h.kurang, tagihan_berjalan: h.tagihan_berjalan, lebih: h.lebih,
    periode_kurang: h.periode_kurang, periode_lebih: h.periode_lebih,
    riwayat: h.periode.slice(-6).map((x) => ({ mulai: x.mulai, status: x.status, selesai: x.selesai })),
    terakhir_bayar: lastI.get(w.id) || null
  };
}

module.exports = route({
  GET: {
    auth: 'public',
    fn: async (req) => {
      const ctx = await bangunKonteks();
      if (ctx.pengaturan.cek_tunggakan_publik === '0') throw fail(403, 'Fitur cek tunggakan sedang dinonaktifkan oleh pengurus.');
      if (!boleh(req.ip || '-')) throw fail(429, 'Terlalu banyak pencarian. Coba lagi beberapa menit lagi.');

      const q = str((req.query || {}).q, 'Nama', { max: 40 }).replace(/[%_\\]/g, '').trim();
      if (q.length < 3) throw fail(400, 'Ketik minimal 3 huruf nama.');
      const rt = (req.query || {}).rt ? oneOf(String((req.query || {}).rt), 'RT', RT_LIST) : null;

      const where = ['aktif = 1', 'nama LIKE ?'];
      const params = [`%${q}%`];
      if (rt) { where.push('rt = ?'); params.push(rt); }
      const wr = await db.query(
        `SELECT id, nama, rt, jenis, mulai_iuran, berhenti_pada, ikut_jimpitan, jimpitan_berhenti, ikut_iuran, iuran_berhenti FROM warga WHERE ${where.join(' AND ')} ORDER BY nama, rt LIMIT ${MAX_HASIL + 1}`,
        params
      );
      const terpotong = wr.rows.length > MAX_HASIL;
      const rows = wr.rows.slice(0, MAX_HASIL);
      if (!rows.length) return { q, hasil: [], terpotong: false };

      const saldo = hitungSaldo(rows, ctx);
      let ctxI = null, hitI = new Map();
      try { ctxI = await bangunKonteksIuran(); if (ctxI.aktif) hitI = hitungIuran(rows, ctxI); } catch (_) { ctxI = null; }
      const ids = rows.map((r) => r.id);
      const last = await db.query(
        `SELECT warga_id, MAX(tanggal) AS t FROM setoran WHERE status = 'sah' AND warga_id IN (${ids.map(() => '?').join(',')}) GROUP BY warga_id`,
        ids
      );
      const lastBy = new Map(last.rows.map((r) => [r.warga_id, String(r.t).slice(0, 10)]));
      let lastI = new Map();
      if (ctxI && ctxI.aktif) {
        try {
          const li = await db.query(
            `SELECT warga_id, MAX(tanggal) AS t FROM iuran_wajib WHERE status = 'sah' AND warga_id IN (${ids.map(() => '?').join(',')}) GROUP BY warga_id`, ids);
          lastI = new Map(li.rows.map((r) => [r.warga_id, String(r.t).slice(0, 10)]));
        } catch (_) { /* abaikan */ }
      }

      const hasil = rows.map((w) => {
        const s = saldo.get(w.id);
        const status = s.kurang > 0 ? 'menunggak' : (s.lebih > 0 ? 'titipan' : 'lunas');
        return {
          nama: w.nama, rt: w.rt, jenis: w.jenis, status,
          kurang: s.kurang, hari_kurang: s.hari_kurang, berjalan_kurang: s.berjalan_kurang, lama_sisa: s.lama_sisa,
          tagihan_berjalan: s.tagihan_berjalan, lebih: s.lebih, hari_tertutup: s.hari_tertutup, lunas_sampai: s.lunas_sampai,
          terakhir_bayar: lastBy.get(w.id) || null,
          jimpitan_wajib: batasProgram(w.ikut_jimpitan, w.jimpitan_berhenti).wajib,
          iuran: iuranHasil(w, ctxI, hitI, lastI)
        };
      });
      return { q, hasil, terpotong, tarif_harian: ctx.tarifNow, dihitung_dari: ctx.mulaiHitung };
    }
  }
});
