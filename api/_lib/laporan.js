const db = require('../db');
const { fail } = require('./http');
const { basisAwal, createKasMemo } = require('./kas');
const { bangunKonteks, hitungSaldo } = require('./util');
const I = require('./iuran');
const P = require('./periode');

/**
 * LAPORAN PER KUMPULAN RW (Selasa Kliwon, malam Rabu Legi; 35 hari) — dipakai halaman Laporan dan PDF yang dibagikan ke warga.
 * Kumpulan pertama dimulai 14 Januari 2026. Isi: ringkasan kas, jimpitan/iuran per RT, sewa, pengeluaran,
 * serta status warga (tunggakan jimpitan & status iuran wajib kumpulan itu, per tanggal laporan dibuat).
 */
const LAPORAN_MULAI = '2026-01-13'; // kumpulan ke-1: Selasa Kliwon (malam Rabu Legi)
const SIKLUS = 35;
const num = (v) => Number(v || 0);
const d10 = (v) => String(v).slice(0, 10);
const hariKe = (tgl) => Math.round(P.parse(tgl).getTime() / 86400000);
const mod = (a, n) => ((a % n) + n) % n;

// Kumpulan RW dilaksanakan Selasa Kliwon (malam Rabu Legi): hari ke-d dengan d ≡ 26 (mod 35). Kumpulan pertama pada/setelah tgl.
const kumpulanPada = (tgl) => P.addDays(tgl, mod(26 - hariKe(tgl), SIKLUS));

/**
 * Laporan kumpulan K = cut off pada tanggal kumpulan itu: transaksi sejak kumpulan sebelumnya (K-34) sampai K.
 * Kumpulan ke-1 dihitung sejak tanggal saldo awal berlaku. Kumpulan yang belum tiba dihitung sampai hari ini.
 */
function bacaPeriode(q, today) {
  const tgl = q ? String(q) : today;
  if (!P.validDate(tgl)) throw fail(400, 'Periode tidak valid.');
  const k = kumpulanPada(tgl < LAPORAN_MULAI ? LAPORAN_MULAI : tgl);
  if (k > kumpulanPada(today)) throw fail(400, 'Kumpulan ini belum dimulai.');
  return { tanggal: k, mulai: P.addDays(k, -(SIKLUS - 1)), akhir: k };
}

function daftarPeriode(today) {
  const out = [];
  const batas = kumpulanPada(today);
  for (let x = LAPORAN_MULAI, n = 1; x <= batas; x = P.addDays(x, SIKLUS), n++) {
    out.push({ tanggal: x, mulai: P.addDays(x, -(SIKLUS - 1)), akhir: x, weton: I.weton(x), berjalan: x >= today, hari_ini: x === today, no: n });
  }
  return out.reverse();
}

async function pengaturanLaporan() {
  const r = await db.query("SELECT kunci, nilai FROM pengaturan WHERE kunci IN ('nama_web', 'subjudul', 'ketua_rw', 'nama_bendahara')");
  const m = Object.fromEntries(r.rows.map((x) => [x.kunci, x.nilai || '']));
  return { nama_web: m.nama_web || '', subjudul: m.subjudul || '', ketua_rw: m.ketua_rw || '', nama_bendahara: m.nama_bendahara || '' };
}

/**
 * @param p        periode {mulai, akhir}
 * @param rt       batasi ke satu RT (peran dibatasi RT) atau null
 * @param keuangan sertakan kas, sewa, dan pengeluaran (izin kas.lihat, tanpa batas RT)
 * @param warga    sertakan status warga (nama) — jimpitan.lihat / iuran.lihat
 */
async function bangunLaporan(p, today, { rt, keuangan, warga }) {
  const sampai = p.akhir < today ? p.akhir : today; // kumpulan yang belum tiba dihitung sampai hari ini
  const nomor = daftarPeriode(today).find((x) => x.tanggal === p.tanggal);
  // Kumpulan ke-1: saldo awal = saldo awal Pengaturan; pemasukan & pengeluaran dihitung sejak tanggal saldo awal berlaku
  const basis = keuangan && nomor && nomor.no === 1 ? await basisAwal(sampai) : null;
  const dari = basis ? basis.mulai : p.mulai;
  const rtW = rt ? ' AND w.rt = ?' : '';
  const prm = rt ? [dari, sampai, rt] : [dari, sampai];

  const jim = await db.query(
    `SELECT w.rt, COUNT(*) AS jumlah, SUM(s.nominal) AS total FROM setoran s JOIN warga w ON w.id = s.warga_id
     WHERE s.status = 'sah' AND s.tanggal BETWEEN ? AND ?${rtW} GROUP BY w.rt ORDER BY w.rt`, prm);
  const iur = await db.query(
    `SELECT w.rt, COUNT(*) AS jumlah, SUM(s.nominal) AS total FROM iuran_wajib s JOIN warga w ON w.id = s.warga_id
     WHERE s.status = 'sah' AND s.tanggal BETWEEN ? AND ?${rtW} GROUP BY w.rt ORDER BY w.rt`, prm);
  const out = {
    periode: { tanggal: p.tanggal, mulai: p.mulai, akhir: p.akhir, dari, weton: I.weton(p.tanggal), berjalan: p.akhir >= today, hari_ini: p.akhir === today, no: nomor ? nomor.no : null, sampai },
    dibuat: today,
    jimpitan_rt: jim.rows.map((r) => ({ rt: r.rt, jumlah: num(r.jumlah), total: num(r.total) })),
    iuran_rt: iur.rows.map((r) => ({ rt: r.rt, jumlah: num(r.jumlah), total: num(r.total) }))
  };
  out.total_jimpitan = out.jimpitan_rt.reduce((a, r) => a + r.total, 0);
  out.total_iuran = out.iuran_rt.reduce((a, r) => a + r.total, 0);

  if (keuangan) {
    const sewa = await db.query(
      "SELECT tanggal, rt, uraian, nominal FROM sewa_aset WHERE status = 'sah' AND tanggal BETWEEN ? AND ? ORDER BY tanggal, created_at", [dari, sampai]);
    const kel = await db.query(
      "SELECT tanggal, kategori, uraian, nominal FROM pengeluaran WHERE status = 'sah' AND tanggal BETWEEN ? AND ? ORDER BY tanggal, created_at", [dari, sampai]);
    out.sewa = sewa.rows.map((r) => ({ tanggal: d10(r.tanggal), rt: r.rt, uraian: r.uraian, nominal: num(r.nominal) }));
    out.pengeluaran = kel.rows.map((r) => ({ tanggal: d10(r.tanggal), kategori: r.kategori, uraian: r.uraian, nominal: num(r.nominal) }));
    const memo = createKasMemo();
    const t = await memo.totalRentang(dari, sampai);
    const awalK = basis ? basis.awal : await (async () => { const x = await memo.totalKas(P.addDays(p.mulai, -1)); return { jimpitan: x.jimpitan, iuran_wajib: x.iuran, sewa_aset: x.sewa, umum: x.umum }; })();
    const akhir = await memo.totalKas(sampai);
    const ks = await db.query("SELECT sumber, COALESCE(SUM(nominal), 0) AS n FROM pengeluaran WHERE status = 'sah' AND tanggal BETWEEN ? AND ? GROUP BY sumber", [dari, sampai]);
    const kelS = { jimpitan: 0, iuran_wajib: 0, sewa_aset: 0, umum: 0 };
    for (const x of ks.rows) kelS[x.sumber] = num(x.n);
    // Dua kas terpisah: Kas Jimpitan, dan Kas Iuran RW (iuran wajib + pemasukan lainnya; pengeluaran tanpa label dana dibebankan ke sini)
    const kasJ = { awal: awalK.jimpitan, masuk: t.jimpitan, keluar: kelS.jimpitan, akhir: akhir.jimpitan };
    const kasRW = {
      awal: awalK.iuran_wajib + awalK.sewa_aset + awalK.umum, masuk: t.iuran + t.sewa, keluar: kelS.iuran_wajib + kelS.sewa_aset + kelS.umum,
      akhir: akhir.iuran + akhir.sewa + akhir.umum, iuran: t.iuran, lainnya: t.sewa
    };
    out.ringkasan = {
      sejak_saldo_awal: !!basis, kas_rw: kasRW, kas_jimpitan: kasJ,
      saldo_awal: kasRW.awal + kasJ.awal, jimpitan: t.jimpitan, iuran: t.iuran, sewa: t.sewa, masuk: t.masuk, keluar: t.keluar, selisih: t.selisih, saldo_akhir: akhir.saldo
    };
  }

  if (warga) {
    const where = ['aktif = 1'];
    const params = [];
    if (rt) { where.push('rt = ?'); params.push(rt); }
    const wr = (await db.query(
      `SELECT id, nama, rt, jenis, mulai_iuran, berhenti_pada, ikut_jimpitan, jimpitan_berhenti, ikut_iuran, iuran_berhenti
       FROM warga WHERE ${where.join(' AND ')} ORDER BY rt, nama`, params)).rows;

    // Jimpitan per tanggal cut off kumpulan: kewajiban jatuh tempo (termasuk tunggakan lama) − setoran sampai cut off
    const ctx0 = await bangunKonteks();
    const byr = await db.query(
      `SELECT warga_id, SUM(nominal) AS n FROM setoran
       WHERE status = 'sah' AND tanggal <= ? AND (tipe = 'tunggakan_lama' OR tanggal >= ?) GROUP BY warga_id`, [sampai, ctx0.mulaiHitung]);
    const ctx = { ...ctx0, today: sampai, bayar: new Map(byr.rows.map((x) => [x.warga_id, num(x.n)])) };
    const wj = wr.filter((w) => w.ikut_jimpitan !== 0 || w.jimpitan_berhenti);
    const saldo = hitungSaldo(wj, ctx);
    const J = new Map();
    let wajibJ = 0, nJ = 0, totJ = 0;
    for (const w of wj) {
      const sd = saldo.get(w.id);
      if (!sd) continue;
      wajibJ += 1;
      J.set(w.id, { kew: sd.lama + sd.kewajiban_tempo, setor: sd.terbayar, kurang: sd.kurang });
      if (sd.kurang > 0) { nJ += 1; totJ += sd.kurang; }
    }
    out.status_jimpitan = { warga_aktif: wajibJ, menunggak: nJ, lunas: wajibJ - nJ, total_tunggakan: totJ };

    // Iuran wajib: kewajiban semua kumpulan sampai kumpulan ini − pembayaran sampai cut off
    const ci = await I.bangunKonteksIuran();
    const IU = new Map();
    if (ci.aktif) {
            const byi = await db.query("SELECT warga_id, SUM(nominal) AS n FROM iuran_wajib WHERE status = 'sah' AND tanggal <= ? GROUP BY warga_id", [sampai]);
      const ci2 = { ...ci, today: sampai, bayar: new Map(byi.rows.map((x) => [x.warga_id, num(x.n)])) };
      const pi = I.periodeDari(p.tanggal); // periode iuran = kumpulan ini (mulai Selasa Kliwon)
      const wi = wr.filter((w) => w.ikut_iuran !== 0 || w.iuran_berhenti);
      const hit = I.hitungIuran(wi, ci2);
      const cnt = { lunas: 0, sebagian: 0, belum: 0 };
      for (const w of wi) {
        const h = hit.get(w.id);
        if (!h) continue;
        IU.set(w.id, { kew: h.kewajiban, setor: h.terbayar, kurang: Math.max(0, h.kewajiban - h.terbayar) });
        const pp = h.periode ? h.periode.find((x) => x.mulai === pi.mulai) : null;
        if (pp) cnt[pp.status] += 1;
      }
      out.status_iuran = { nominal: I.nominalPada(ci.tarif, pi.mulai), ...cnt, total: cnt.lunas + cnt.sebagian + cnt.belum };
    } else {
      out.status_iuran = null;
    }

    // Seluruh warga wajib (iuran dan/atau jimpitan). selisih = setoran − kewajiban: minus = tunggakan, plus = kelebihan
    out.status_warga = [];
    for (const w of wr) {
      const j = J.get(w.id), i = IU.get(w.id);
      if (!j && !i) continue;
      const jj = j || { kew: 0, setor: 0 }, ii = i || { kew: 0, setor: 0 };
      const si = ii.setor - ii.kew, sj = jj.setor - jj.kew;
      out.status_warga.push({
        nama: w.nama, rt: w.rt,
        iuran_kewajiban: ii.kew, iuran_setor: ii.setor, iuran_selisih: si,
        jimpitan_kewajiban: jj.kew, jimpitan_setor: jj.setor, jimpitan_selisih: sj,
        tunggakan: Math.max(0, -si) + Math.max(0, -sj), kelebihan: Math.max(0, si) + Math.max(0, sj)
      });
    }
    // Per RT; yang menunggak paling atas, lalu lunas, lalu kelebihan
    out.status_warga.sort((a, b) => a.rt.localeCompare(b.rt) || b.tunggakan - a.tunggakan || a.kelebihan - b.kelebihan || a.nama.localeCompare(b.nama));
  }
  return out;
}

module.exports = { LAPORAN_MULAI, bacaPeriode, daftarPeriode, pengaturanLaporan, bangunLaporan };
