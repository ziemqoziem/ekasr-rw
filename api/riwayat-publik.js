const db = require('./db');
const { route, fail, str, oneOf, RT_LIST } = require('./_lib/http');
const { bangunKonteks, kewajiban, batasProgram } = require('./_lib/util');
const P = require('./_lib/periode');

/**
 * Riwayat jimpitan PUBLIK satu warga (nama + RT persis, dari hasil cek tunggakan):
 *   bulanan   = per bulan: kewajiban, setoran, saldo kumulatif pada akhir bulan (bulan berjalan sampai hari ini)
 *   transaksi = 30 setoran sah terakhir (tanggal + nominal, tanpa petugas/catatan)
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

const akhirBulan = (ym) => { const [y, m] = ym.split('-').map(Number); return `${ym}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`; };
const bulanBerikut = (ym) => { const [y, m] = ym.split('-').map(Number); return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`; };

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
        'SELECT id, nama, rt, jenis, mulai_iuran, berhenti_pada, ikut_jimpitan, jimpitan_berhenti FROM warga WHERE aktif = 1 AND nama = ? AND rt = ? LIMIT 2',
        [nama, rt]
      )).rows;
      if (rows.length !== 1) throw fail(404, 'Warga tidak ditemukan.');
      const w = rows[0];

      // Rentang kewajiban: sama dengan perhitungan saldo (hitungSaldo)
      const mi = w.mulai_iuran ? String(w.mulai_iuran).slice(0, 10) : null;
      const start = mi && mi > ctx.mulaiHitung ? mi : ctx.mulaiHitung;
      const bt = w.berhenti_pada ? String(w.berhenti_pada).slice(0, 10) : null;
      let end = bt && bt < ctx.today ? bt : ctx.today;
      const prog = batasProgram(w.ikut_jimpitan, w.jimpitan_berhenti);
      if (!prog.wajib) end = P.addDays(start, -1);
      else if (prog.sampai && prog.sampai < end) end = prog.sampai;

      const bayar = (await db.query(
        "SELECT tanggal, nominal FROM setoran WHERE warga_id = ? AND status = 'sah' AND tanggal >= ? ORDER BY tanggal",
        [w.id, ctx.mulaiHitung]
      )).rows.map((x) => ({ tanggal: String(x.tanggal).slice(0, 10), nominal: Number(x.nominal) }));
      const perBulan = new Map();
      let sumSejak = 0;
      for (const x of bayar) { const k = x.tanggal.slice(0, 7); perBulan.set(k, (perBulan.get(k) || 0) + x.nominal); sumSejak += x.nominal; }
      const lama = ctx.lama.get(w.id) || 0;
      // Saldo pembuka = cicilan tunggakan lama sebelum tanggal mulai hitung − tunggakan lama
      let saldo = ((ctx.bayar.get(w.id) || 0) - sumSejak) - lama;

      const bulan = [];
      for (let ym = ctx.mulaiHitung.slice(0, 7); ym <= ctx.today.slice(0, 7); ym = bulanBerikut(ym)) {
        const me = akhirBulan(ym);
        const a = `${ym}-01` > start ? `${ym}-01` : start;
        const b = me < end ? me : end;
        const kew = kewajiban(a, b, ctx.tarif);
        const bayarBln = perBulan.get(ym) || 0;
        saldo += bayarBln - kew;
        const berjalan = ym === ctx.today.slice(0, 7);
        bulan.push({ bulan: ym, tanggal: berjalan ? ctx.today : me, berjalan, kewajiban: kew, setoran: bayarBln, saldo, status: saldo < 0 ? 'kurang' : saldo > 0 ? 'titipan' : 'lunas' });
      }
      return {
        warga: { nama: w.nama, rt: w.rt, jenis: w.jenis },
        tarif_harian: ctx.tarifNow, mulai_hitung: ctx.mulaiHitung, saldo, tunggakan_lama: lama,
        bulanan: bulan.reverse(),
        transaksi: bayar.slice(-30).reverse()
      };
    }
  }
});
