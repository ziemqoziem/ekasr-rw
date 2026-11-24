const db = require('../db');
const P = require('./periode');
const { fail } = require('./http');
const { newId, batasProgram } = require('./util');
const { pastikanTerbuka } = require('./tutupbuku');

/* =====================================================================================
 * IURAN WAJIB — periode = tiap RABU LEGI (35 hari = lcm(7 hari, 5 pasaran)).
 *   hari sejak 1 Jan 1970 = d  → hari: (d + 4) mod 7  (0 = Minggu; 3 = Rabu)
 *                              → pasaran: (d + 3) mod 5 (0 = Legi, 1 Pahing, 2 Pon, 3 Wage, 4 Kliwon)
 *   (1 Jan 1970 = Kamis Wage; 17 Agu 1945 = Jumat Legi → dipakai sebagai uji)
 *   Rabu Legi jatuh pada d ≡ 27 (mod 35). Periode: [Rabu Legi, Rabu Legi berikutnya − 1].
 * Pembayaran seperti pola jimpitan: nominal bebas; saldo = total bayar − kewajiban periode yang sudah dimulai;
 * pembayaran menutup periode TERTUA lebih dulu.
 * ===================================================================================== */
const SIKLUS = 35;
const PASARAN = ['Legi', 'Pahing', 'Pon', 'Wage', 'Kliwon'];
const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const mod = (a, n) => ((a % n) + n) % n;
const hariKe = (tgl) => Math.round(P.parse(tgl).getTime() / 86400000);

const pasaran = (tgl) => PASARAN[mod(hariKe(tgl) + 3, 5)];
const namaHari = (tgl) => HARI[mod(hariKe(tgl) + 4, 7)];
const weton = (tgl) => `${namaHari(tgl)} ${pasaran(tgl)}`;

// Periode yang memuat tanggal
function periodeDari(tgl) {
  const mulai = P.addDays(tgl, -mod(hariKe(tgl) - 27, SIKLUS));
  return { mulai, akhir: P.addDays(mulai, SIKLUS - 1) };
}
// Periode pertama yang DIMULAI pada/setelah tanggal tertentu (kumpulan Rabu Legi pertama sejak tanggal itu)
function periodePertama(tgl) {
  const p = periodeDari(tgl);
  return p.mulai < tgl ? periodeBerikut(p) : p;
}
const periodeBerikut = (p) => periodeDari(P.addDays(p.akhir, 1));
const periodeSebelum = (p) => periodeDari(P.addDays(p.mulai, -1));

// n periode terakhir sampai periode yang memuat `tgl` (urut lama → baru)
function periodeTerakhir(tgl, n) {
  const out = [];
  let p = periodeDari(tgl);
  for (let i = 0; i < n; i++) { out.unshift(p); p = periodeSebelum(p); }
  return out;
}

async function loadTarifIuran() {
  const r = await db.query('SELECT nominal, berlaku_mulai FROM tarif_iuran ORDER BY berlaku_mulai ASC');
  return r.rows.map((t) => ({ nominal: t.nominal, mulai: String(t.berlaku_mulai).slice(0, 10) }));
}
const nominalPada = (tarif, tgl) => tarif.reduce((n, t) => (t.mulai <= tgl ? t.nominal : n), 0);

async function loadBayarIuran() {
  const r = await db.query("SELECT warga_id, SUM(nominal) AS n FROM iuran_wajib WHERE status = 'sah' GROUP BY warga_id");
  return new Map(r.rows.map((x) => [x.warga_id, Number(x.n)]));
}

// Konteks hitung: aktif bila tanggal mulai penagihan & tarif sudah diisi admin
async function bangunKonteksIuran() {
  const today = P.todayWIB();
  const ps = await db.query("SELECT nilai FROM pengaturan WHERE kunci = 'iuran_mulai'");
  const iuranMulai = ps.rows[0] && ps.rows[0].nilai ? String(ps.rows[0].nilai).slice(0, 10) : null;
  const tarif = await loadTarifIuran();
  const nominalNow = nominalPada(tarif, today);
  return {
    today, iuranMulai, tarif, nominalNow,
    aktif: !!iuranMulai && nominalNow > 0,
    bayar: await loadBayarIuran()
  };
}

/**
 * Hitung kewajiban & status periode untuk daftar warga.
 * Kembalikan Map(warga_id → { periode: [{mulai, akhir, nominal, dibayar, status}], kurang, tagihan_berjalan, lebih, ... })
 * status periode: lunas | sebagian | belum (hanya untuk periode yang sudah dimulai)
 */
function hitungIuran(wargaList, ctx) {
  const out = new Map();
  if (!ctx.iuranMulai) return out;
  const awalPenagihan = periodePertama(ctx.iuranMulai).mulai;
  for (const w of wargaList) {
    const mi = w.mulai_iuran ? String(w.mulai_iuran).slice(0, 10) : null;
    let p = periodePertama(mi && mi > ctx.iuranMulai ? mi : ctx.iuranMulai);
    if (p.mulai < awalPenagihan) p = periodeDari(awalPenagihan);
    let bt = w.berhenti_pada ? String(w.berhenti_pada).slice(0, 10) : null;
    const prog = batasProgram(w.ikut_iuran, w.iuran_berhenti);
    if (!prog.wajib) {   // tidak wajib iuran kas: tidak ada tagihan
      out.set(w.id, { periode: [], bebas: true, terbayar: ctx.bayar.get(w.id) || 0, kewajiban: 0, saldo: ctx.bayar.get(w.id) || 0, lebih: ctx.bayar.get(w.id) || 0, kurang: 0, tagihan_berjalan: 0, periode_kurang: 0, periode_lebih: 0 });
      continue;
    }
    if (prog.sampai && (!bt || prog.sampai < bt)) bt = prog.sampai;
    let kredit = ctx.bayar.get(w.id) || 0;
    const bayarAwal = kredit;
    const periode = [];
    let kewTotal = 0, kewSelesai = 0, guard = 0;
    while (p.mulai <= ctx.today && (!bt || p.mulai <= bt) && guard++ < 1500) {
      const nominal = nominalPada(ctx.tarif, p.mulai);
      const dibayar = Math.min(kredit, nominal);
      kredit -= dibayar;
      kewTotal += nominal;
      if (p.akhir < ctx.today) kewSelesai += nominal;
      periode.push({
        mulai: p.mulai, akhir: p.akhir, nominal, dibayar,
        status: nominal <= 0 || dibayar >= nominal ? 'lunas' : dibayar > 0 ? 'sebagian' : 'belum',
        selesai: p.akhir < ctx.today
      });
      p = periodeBerikut(p);
    }
    const saldo = bayarAwal - kewTotal;
    out.set(w.id, {
      periode, terbayar: bayarAwal, kewajiban: kewTotal,
      saldo, lebih: Math.max(0, saldo),
      kurang: Math.max(0, kewSelesai - bayarAwal),       // tunggakan: periode yang sudah berakhir
      tagihan_berjalan: Math.max(0, -saldo),             // termasuk periode yang sedang berjalan
      periode_kurang: periode.filter((x) => x.selesai && x.status !== 'lunas').length,
      periode_lebih: ctx.nominalNow > 0 ? Math.floor(Math.max(0, saldo) / ctx.nominalNow) : 0
    });
  }
  return out;
}

const METODE = ['tunai', 'transfer'];
// Simpan satu pembayaran iuran wajib (nominal bebas). Peringatan duplikat seperti jimpitan.
async function simpanIuran({ user, warga, tanggal, nominal, metode, catatan, abaikanDuplikat }) {
  const nom = Number(nominal);
  if (!Number.isInteger(nom) || nom <= 0 || nom > 2000000000) throw fail(400, 'Nominal harus bilangan bulat lebih dari 0.');
  await pastikanTerbuka(tanggal);
  if (!abaikanDuplikat) {
    const d = await db.query(
      "SELECT id FROM iuran_wajib WHERE warga_id = ? AND tanggal = ? AND nominal = ? AND status = 'sah' LIMIT 1",
      [warga.id, tanggal, nom]
    );
    if (d.rows.length) {
      const e = fail(409, `${warga.nama}: sudah ada iuran wajib Rp ${nom.toLocaleString('id-ID')} pada tanggal ini. Yakin menambah lagi?`);
      e.kode = 'DUPLIKAT';
      throw e;
    }
  }
  const id = newId('IWJ');
  await db.query(
    'INSERT INTO iuran_wajib (id, warga_id, tanggal, nominal, metode, petugas, catatan) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, warga.id, tanggal, nom, METODE.includes(metode) ? metode : 'tunai', user.username, catatan || null]
  );
  return { id, nominal: nom };
}

module.exports = {
  METODE, simpanIuran, SIKLUS, pasaran, namaHari, weton, periodeDari, periodeBerikut, periodeSebelum, periodePertama, periodeTerakhir,
  nominalPada, loadTarifIuran, bangunKonteksIuran, hitungIuran
};
