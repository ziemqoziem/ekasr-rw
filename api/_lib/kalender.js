const db = require('../db');
const { hitungSaldo, jatuhTempo, batasProgram } = require('./util');
const P = require('./periode');

const geserBulan = (bulan, n) =>
  new Date(Date.UTC(Number(bulan.slice(0, 4)), Number(bulan.slice(5, 7)) - 1 + n, 1)).toISOString().slice(0, 7);

/**
 * Kalender setoran satu warga untuk `jumlah` bulan berakhir pada `bulanAkhir`.
 * Setoran (setelah melunasi tunggakan lama) dialokasikan ke hari-hari sejak mulai iuran, dari yang tertua.
 * Status: hijau (tertutup) | merah (jatuh tempo, belum tertutup) | berjalan (belum jatuh tempo)
 *         | depan (mendatang) | luar (di luar masa iuran)
 */
async function bangunKalender(w, ctx, bulanAkhir, jumlah, { nominal = false } = {}) {
  const bulanList = [];
  for (let i = jumlah - 1; i >= 0; i--) bulanList.push(geserBulan(bulanAkhir, -i));
  const awal = P.rangeOf('bulanan', bulanList[0])[0];
  const akhir = P.rangeOf('bulanan', bulanAkhir)[1];

  const mi = w.mulai_iuran ? String(w.mulai_iuran).slice(0, 10) : null;
  const start = mi && mi > ctx.mulaiHitung ? mi : ctx.mulaiHitung;
  let bt = w.berhenti_pada ? String(w.berhenti_pada).slice(0, 10) : null;
  const prog = batasProgram(w.ikut_jimpitan, w.jimpitan_berhenti);
  if (prog.sampai && (!bt || prog.sampai < bt)) bt = prog.sampai;
  const tempo = jatuhTempo(w.jenis, ctx.today);
  const s = hitungSaldo([w], ctx).get(w.id);
  let kredit = Math.max(0, s.terbayar - s.lama);
  const tarifPada = (t) => ctx.tarif.reduce((n, x) => (x.mulai <= t ? x.nominal : n), 0);

  const setor = new Map();
  if (nominal) {
    const sr = await db.query(
      "SELECT tanggal, SUM(nominal) AS n FROM setoran WHERE warga_id = ? AND status = 'sah' AND tanggal BETWEEN ? AND ? GROUP BY tanggal",
      [w.id, awal, akhir]
    );
    for (const x of sr.rows) setor.set(String(x.tanggal).slice(0, 10), Number(x.n));
  }

  const status = new Map();
  let guard = 0;
  for (let t = start; t <= akhir && guard++ < 4000; t = P.addDays(t, 1)) {
    const biaya = tarifPada(t);
    let st;
    if (!prog.wajib || (bt && t > bt) || biaya <= 0) st = 'luar';
    else if (kredit >= biaya) { kredit -= biaya; st = 'hijau'; }
    else { kredit = 0; st = t > ctx.today ? 'depan' : t <= tempo ? 'merah' : 'berjalan'; }
    if (t >= awal) status.set(t, st);
  }

  const bulan = bulanList.map((b) => {
    const [a, z] = P.rangeOf('bulanan', b);
    const hari = [];
    const ringkas = { hijau: 0, merah: 0, berjalan: 0, depan: 0, luar: 0 };
    for (let d = a; d <= z; d = P.addDays(d, 1)) {
      const st = status.get(d) || 'luar';
      ringkas[st] += 1;
      const h = { tanggal: d, status: st };
      if (nominal) h.setoran = setor.get(d) || 0;
      hari.push(h);
    }
    return { bulan: b, hari, ringkas };
  });

  return {
    bulan, today: ctx.today, mulai: start, tarif_harian: ctx.tarifNow,
    saldo: { kurang: s.kurang, lebih: s.lebih, lunas_sampai: s.lunas_sampai, tagihan_berjalan: s.tagihan_berjalan }
  };
}

module.exports = { bangunKalender, geserBulan };
