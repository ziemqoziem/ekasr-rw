const db = require('../db');
const P = require('./periode');

async function getPengaturan() {
  const r = await db.query('SELECT kunci, nilai FROM pengaturan');
  const o = {};
  for (const row of r.rows) o[row.kunci] = row.nilai;
  return o;
}

async function catat(user, aksi, deskripsi, req) {
  try {
    const ip = String((req && (req.ip || (req.socket && req.socket.remoteAddress))) || '-').slice(0, 50);
    await db.query(
      'INSERT INTO log_aktivitas (username, nama, role, aksi, deskripsi, ip_address) VALUES (?, ?, ?, ?, ?, ?)',
      [user.username, user.nama || null, user.role || null, String(aksi).slice(0, 50), String(deskripsi).slice(0, 1000), ip]
    );
  } catch (e) {
    console.warn('[log_aktivitas]', e.message);
  }
}

// Semua tarif per jenis, urut naik menurut tanggal berlaku
async function loadTarif() {
  const r = await db.query('SELECT jenis, nominal, berlaku_mulai FROM tarif ORDER BY berlaku_mulai ASC');
  const by = { harian: [], mingguan: [], bulanan: [] };
  for (const t of r.rows) by[t.jenis].push({ nominal: t.nominal, mulai: String(t.berlaku_mulai).slice(0, 10) });
  return by;
}
function tarifPada(tarifBy, jenis, tanggal) {
  let n = 0;
  for (const t of tarifBy[jenis] || []) if (t.mulai <= tanggal) n = t.nominal;
  return n;
}

let seq = 0;
function newId(prefix) {
  seq = (seq + 1) % 1000;
  const d = P.todayWIB().replace(/-/g, '');
  const rnd = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${d}-${Date.now().toString(36).toUpperCase()}${seq}${rnd}`.slice(0, 40);
}

/* =====================================================================================
 * MODEL SALDO (kewajiban harian + setoran bebas)
 *   kewajiban  = jumlah hari kalender × tarif harian (bertingkat bila tarif berubah)
 *   terbayar   = total setoran sah sejak "mulai hitung" (+ semua cicilan tunggakan lama)
 *   saldo      = terbayar − tunggakan lama − kewajiban sampai hari ini
 *   saldo > 0  → titipan (menutup hari-hari berikutnya) ; saldo < 0 → kurang
 *   tunggakan  = kurang pada JATUH TEMPO pola warga (harian: kemarin; mingguan: Minggu terakhir;
 *                bulanan: akhir bulan terakhir). Selisih sebelum jatuh tempo tampil sebagai tagihan berjalan.
 * ===================================================================================== */
const hariAntara = (a, b) => (b < a ? 0 : Math.round((P.parse(b) - P.parse(a)) / 86400000) + 1);

// Tanggal terakhir yang kewajibannya sudah jatuh tempo menurut pola
function jatuhTempo(jenis, today) {
  const kemarin = P.addDays(today, -1);
  if (jenis === 'mingguan') {
    const dow = (P.parse(kemarin).getUTCDay() + 6) % 7; // Senin = 0
    return dow === 6 ? kemarin : P.addDays(kemarin, -(dow + 1));
  }
  if (jenis === 'bulanan') {
    const [, akhir] = P.rangeOf('bulanan', kemarin.slice(0, 7));
    return kemarin === akhir ? kemarin : P.addDays(`${kemarin.slice(0, 7)}-01`, -1);
  }
  return kemarin; // harian
}

// Total kewajiban pada [start, end] (inklusif) dengan tarif bertingkat: tarifList urut naik [{mulai, nominal}]
function kewajiban(start, end, tarifList) {
  if (end < start) return 0;
  let total = 0;
  for (let i = 0; i < tarifList.length; i++) {
    const a = tarifList[i].mulai > start ? tarifList[i].mulai : start;
    const sampai = i + 1 < tarifList.length ? P.addDays(tarifList[i + 1].mulai, -1) : end;
    const b = sampai < end ? sampai : end;
    if (b >= a) total += hariAntara(a, b) * tarifList[i].nominal;
  }
  return total;
}

/**
 * Keikutsertaan warga pada satu program (jimpitan / iuran kas):
 *   ikut = 1                      → wajib sampai berhenti (kewajiban berjalan)
 *   ikut = 0 + tanggal berhenti    → wajib sampai tanggal itu (riwayat & tunggakan sebelumnya tetap)
 *   ikut = 0 tanpa tanggal         → tidak wajib sejak awal
 * Nilai tak ada (kolom belum dipilih) dianggap ikut.
 */
function batasProgram(ikut, berhenti) {
  if (ikut === undefined || ikut === null || Number(ikut) !== 0) return { wajib: true, sampai: null };
  const b = berhenti ? String(berhenti).slice(0, 10) : null;
  return b ? { wajib: true, sampai: b } : { wajib: false, sampai: null };
}

/**
 * Hitung saldo untuk daftar warga.
 * ctx: { tarif: [{mulai, nominal}] (harian, urut naik), mulaiHitung, today, bayar: Map<id,sum>, lama: Map<id,sum> }
 */
function hitungSaldo(wargaList, ctx) {
  const out = new Map();
  const tarifNow = ctx.tarif.reduce((n, t) => (t.mulai <= ctx.today ? t.nominal : n), 0);
  for (const w of wargaList) {
    const mi = w.mulai_iuran ? String(w.mulai_iuran).slice(0, 10) : null;
    const start = mi && mi > ctx.mulaiHitung ? mi : ctx.mulaiHitung;
    const bt = w.berhenti_pada ? String(w.berhenti_pada).slice(0, 10) : null;
    let end = bt && bt < ctx.today ? bt : ctx.today;
    const prog = batasProgram(w.ikut_jimpitan, w.jimpitan_berhenti);
    if (!prog.wajib) end = P.addDays(start, -1);               // bebas jimpitan: tidak ada kewajiban
    else if (prog.sampai && prog.sampai < end) end = prog.sampai;
    const tempo = jatuhTempo(w.jenis, ctx.today);
    const dueEnd = tempo < end ? tempo : end;

    const kewBerjalan = kewajiban(start, end, ctx.tarif);
    const kewTempo = kewajiban(start, dueEnd, ctx.tarif);
    const terbayar = ctx.bayar.get(w.id) || 0;
    const lama = ctx.lama.get(w.id) || 0;

    const saldo = terbayar - lama - kewBerjalan;
    const kurang = Math.max(0, lama + kewTempo - terbayar);          // tunggakan (sudah jatuh tempo)
    const lamaSisa = Math.max(0, lama - terbayar);                    // pembayaran menutup tunggakan lama lebih dulu
    const berjalanKurang = Math.max(0, kewTempo - Math.max(0, terbayar - lama));
    const lebih = Math.max(0, saldo);
    const hariTertutup = tarifNow > 0 ? Math.floor(lebih / tarifNow) : 0;
    out.set(w.id, {
      terbayar, lama, kewajiban_berjalan: kewBerjalan, kewajiban_tempo: kewTempo,
      saldo, kurang, lama_sisa: lamaSisa, berjalan_kurang: berjalanKurang,
      tagihan_berjalan: Math.max(0, -saldo),                         // kurang real-time (termasuk yang belum jatuh tempo)
      lebih, hari_tertutup: hariTertutup,
      hari_kurang: tarifNow > 0 ? Math.ceil(kurang / tarifNow) : 0,
      lunas_sampai: saldo >= 0 ? P.addDays(end, hariTertutup) : null,
      jatuh_tempo: tempo
    });
  }
  return out;
}

// Total setoran sah per warga: cicilan tunggakan lama (semua tanggal) + setoran rutin sejak mulai hitung.
// Dipisah agar index (status, …) terpakai; OR tunggal sulit dioptimalkan optimizer.
async function loadBayarMap(mulaiHitung) {
  const [lama, rutin] = await Promise.all([
    db.query(
      "SELECT warga_id, SUM(nominal) AS n FROM setoran WHERE status = 'sah' AND tipe = 'tunggakan_lama' GROUP BY warga_id"
    ),
    db.query(
      "SELECT warga_id, SUM(nominal) AS n FROM setoran WHERE status = 'sah' AND tipe = 'rutin' AND tanggal >= ? GROUP BY warga_id",
      [mulaiHitung]
    )
  ]);
  const m = new Map();
  for (const x of lama.rows) m.set(x.warga_id, Number(x.n));
  for (const x of rutin.rows) m.set(x.warga_id, (m.get(x.warga_id) || 0) + Number(x.n));
  return m;
}
async function loadLamaMap() {
  const r = await db.query("SELECT warga_id, SUM(nominal) AS n FROM tunggakan_lama WHERE status = 'aktif' GROUP BY warga_id");
  return new Map(r.rows.map((x) => [x.warga_id, Number(x.n)]));
}

let ctxCache = null;
let ctxCacheAt = 0;
const CTX_TTL_MS = Number(process.env.KONTEKS_CACHE_TTL_MS || 20000);

function invalidateKonteks() {
  ctxCache = null;
  ctxCacheAt = 0;
}

// Konteks hitung siap pakai (tarif harian, mulai hitung, peta bayar & lama) — cache singkat per proses
async function bangunKonteks() {
  if (ctxCache && Date.now() - ctxCacheAt < CTX_TTL_MS) return ctxCache;
  const today = P.todayWIB();
  const pengaturan = await getPengaturan();
  const mulaiHitung = pengaturan.mulai_hitung || today;
  const tarifBy = await loadTarif();
  const [bayar, lama] = await Promise.all([loadBayarMap(mulaiHitung), loadLamaMap()]);
  ctxCache = {
    today, mulaiHitung, pengaturan, tarif: tarifBy.harian,
    tarifNow: tarifPada(tarifBy, 'harian', today), bayar, lama
  };
  ctxCacheAt = Date.now();
  return ctxCache;
}

module.exports = {
  batasProgram, getPengaturan, catat, loadTarif, tarifPada, newId, jatuhTempo, kewajiban,
  hitungSaldo, bangunKonteks, invalidateKonteks
};
