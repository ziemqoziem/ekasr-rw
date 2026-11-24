const db = require('./db');
const { route } = require('./_lib/http');
const { bangunKonteks, hitungSaldo, jatuhTempo } = require('./_lib/util');
const P = require('./_lib/periode');
const { totalKas, totalRentang } = require('./_lib/kas');
const I = require('./_lib/iuran');

const num = (v) => Number(v || 0);
const pad = (n) => String(n).padStart(2, '0');

function enamBulan(bulan) {
  let y = Number(bulan.slice(0, 4));
  let m = Number(bulan.slice(5, 7));
  const out = [];
  for (let i = 0; i < 6; i++) {
    out.unshift(`${y}-${pad(m)}`);
    m -= 1;
    if (m === 0) { m = 12; y -= 1; }
  }
  return out;
}

/**
 * Ringkasan PUBLIK (tanpa login): hanya angka agregat — tidak memuat nama atau nominal pribadi warga.
 * Pencarian tunggakan per nama ada di /api/cek-tunggakan (dengan pembatasan tersendiri).
 */
module.exports = route({
  GET: {
    auth: 'public',
    fn: async () => {
      const today = P.todayWIB();
      const bulan = today.slice(0, 7);
      const [awalBulan] = P.rangeOf('bulanan', bulan);
      const bulanLalu = P.addDays(awalBulan, -1).slice(0, 7);
      const [awalLalu, akhirLalu] = P.rangeOf('bulanan', bulanLalu);

      const warga = await db.query('SELECT rt, jenis, COUNT(*) AS n FROM warga WHERE aktif = 1 AND (ikut_jimpitan = 1 OR jimpitan_berhenti IS NOT NULL) GROUP BY rt, jenis ORDER BY rt');
      const bayar = await db.query(
        `SELECT w.rt, COUNT(DISTINCT s.warga_id) AS warga, SUM(s.nominal) AS total
         FROM setoran s JOIN warga w ON w.id = s.warga_id
         WHERE s.status = 'sah' AND s.tanggal BETWEEN ? AND ? GROUP BY w.rt`,
        [awalBulan, today]
      );
      const bayarBy = new Map(bayar.rows.map((r) => [r.rt, r]));
      const rtMap = new Map();
      for (const r of warga.rows) rtMap.set(r.rt, (rtMap.get(r.rt) || 0) + num(r.n));
      const rt = [...rtMap.entries()].map(([k, n]) => {
        const b = bayarBy.get(k);
        const sudah = b ? num(b.warga) : 0;
        return { rt: k, warga_aktif: n, warga_menyetor_bulan_ini: sudah, persen: n ? Math.round((sudah / n) * 100) : 0, total_bulan_ini: b ? num(b.total) : 0 };
      });

      const kasAll = await totalKas();
      const masuk = kasAll.masuk;
      const keluar = kasAll.keluar;
      const keluarBulan = num((await db.query(
        "SELECT COALESCE(SUM(nominal), 0) AS n FROM pengeluaran WHERE status = 'sah' AND tanggal BETWEEN ? AND ?", [awalBulan, today]
      )).rows[0].n);
      const lalu = num((await db.query(
        "SELECT COALESCE(SUM(nominal), 0) AS n FROM setoran WHERE status = 'sah' AND tanggal BETWEEN ? AND ?", [awalLalu, akhirLalu]
      )).rows[0].n);

      // Tren 6 bulan (agregat seluruh RW)
      const b6 = enamBulan(bulan);
      const trenR = await db.query(
        `SELECT DATE_FORMAT(tanggal, '%Y-%m') AS b, SUM(nominal) AS total FROM setoran
         WHERE status = 'sah' AND tanggal BETWEEN ? AND ? GROUP BY b`,
        [`${b6[0]}-01`, today]
      );
      const tMap = new Map(trenR.rows.map((r) => [r.b, num(r.total)]));

      // Saldo seluruh warga aktif (agregat saja; tanpa nama)
      const ctx = await bangunKonteks();
      const pengaturan = ctx.pengaturan;
      const wl = await db.query('SELECT id, rt, jenis, mulai_iuran, berhenti_pada, ikut_jimpitan, jimpitan_berhenti, ikut_iuran, iuran_berhenti FROM warga WHERE aktif = 1 AND (ikut_jimpitan = 1 OR jimpitan_berhenti IS NOT NULL)');
      const saldo = hitungSaldo(wl.rows, ctx);
      const totalJenis = { harian: 0, mingguan: 0, bulanan: 0 };
      const bebasJenis = { harian: 0, mingguan: 0, bulanan: 0 };
      let tunggakanTotal = 0, menunggak = 0, titipan = 0;
      for (const w of wl.rows) {
        const s = saldo.get(w.id);
        totalJenis[w.jenis] += 1;
        if (s.kurang === 0) bebasJenis[w.jenis] += 1; else { menunggak += 1; tunggakanTotal += s.kurang; }
        titipan += s.lebih;
      }
      const lbl = (t) => `${t.slice(8)}/${t.slice(5, 7)}`;
      const kepatuhan = ['harian', 'mingguan', 'bulanan']
        .filter((j) => totalJenis[j] > 0)
        .map((j) => ({ jenis: j, periode: `bebas tunggakan s.d. ${lbl(jatuhTempo(j, today))}`, total: totalJenis[j], sudah: bebasJenis[j] }));
      const totalWarga = rt.reduce((a, r) => a + r.warga_aktif, 0);

      /* ---- KAS lengkap (agregat; tanpa nama) ---- */
      const per = (n) => ({ jimpitan: n.jimpitan, iuran: n.iuran, sewa: n.sewa, masuk: n.masuk, keluar: n.keluar, selisih: n.selisih });
      const [bi, bl] = [await totalRentang(awalBulan, today), await totalRentang(awalLalu, akhirLalu)];
      const bulanSql = async (tabel) => {
        const r = await db.query(
          `SELECT DATE_FORMAT(tanggal, '%Y-%m') AS b, SUM(nominal) AS total FROM ${tabel} WHERE status = 'sah' AND tanggal BETWEEN ? AND ? GROUP BY b`,
          [`${b6[0]}-01`, today]
        );
        return new Map(r.rows.map((x) => [x.b, num(x.total)]));
      };
      const [mJ, mI, mS, mK] = [await bulanSql('setoran'), await bulanSql('iuran_wajib'), await bulanSql('sewa_aset'), await bulanSql('pengeluaran')];
      const trenKas = b6.map((b) => ({ bulan: b, jimpitan: mJ.get(b) || 0, iuran: mI.get(b) || 0, sewa: mS.get(b) || 0, keluar: mK.get(b) || 0 }));
      const periodeKas = [];
      for (const p of I.periodeTerakhir(today, 4)) {
        const akhir = p.akhir < today ? p.akhir : today;
        const t = await totalRentang(p.mulai, akhir);
        periodeKas.push({ mulai: p.mulai, akhir: p.akhir, weton: I.weton(p.mulai), berjalan: p.akhir >= today, ...per(t), saldo_akhir: (await totalKas(akhir)).saldo });
      }
      const hariIni = (await db.query("SELECT COUNT(DISTINCT warga_id) AS w, COALESCE(SUM(nominal), 0) AS n FROM setoran WHERE status = 'sah' AND tanggal = ?", [today])).rows[0];
      const kas = {
        saldo: kasAll.saldo, masuk: kasAll.masuk, keluar: kasAll.keluar,
        kantong: [
          { kode: 'jimpitan', nama: 'Kas Jimpitan', saldo: kasAll.jimpitan, awal: kasAll.awal.jimpitan, masuk: kasAll.trx.jimpitan, keluar: kasAll.keluar_sumber.jimpitan },
          // Kas Bendahara RW = iuran wajib + pemasukan lainnya (digabung)
          { kode: 'bendahara_rw', nama: 'Kas Bendahara RW', saldo: kasAll.iuran + kasAll.sewa, awal: kasAll.awal.iuran_wajib + kasAll.awal.sewa_aset, masuk: kasAll.trx.iuran_wajib + kasAll.trx.sewa_aset, keluar: kasAll.keluar_sumber.iuran_wajib + kasAll.keluar_sumber.sewa_aset },
          { kode: 'umum', nama: 'Pengeluaran Umum', saldo: kasAll.umum, awal: kasAll.awal.umum, masuk: 0, keluar: kasAll.keluar_sumber.umum }
        ],
        bulan_ini: per(bi), bulan_lalu: per(bl), tren: trenKas, per_periode: periodeKas, tahun_basis: kasAll.tahun_basis
      };

      /* ---- Iuran wajib (kas RW) periode berjalan: agregat ---- */
      let iuran = { aktif: false };
      try {
        const ci = await I.bangunKonteksIuran();
        if (ci.aktif) {
          const wi = await db.query('SELECT id, mulai_iuran, berhenti_pada, ikut_iuran, iuran_berhenti FROM warga WHERE aktif = 1 AND (ikut_iuran = 1 OR iuran_berhenti IS NOT NULL)');
          const hi = I.hitungIuran(wi.rows, ci);
          const pr = I.periodeDari(today);
          const cnt = { lunas: 0, sebagian: 0, belum: 0 };
          let tungg = 0, nTung = 0, titip = 0;
          for (const w of wi.rows) {
            const h = hi.get(w.id);
            if (!h || h.bebas) continue;
            const pp = h.periode.find((x) => x.mulai === pr.mulai);
            if (pp) cnt[pp.status] += 1;
            if (h.kurang > 0) { nTung += 1; tungg += h.kurang; }
            titip += h.lebih;
          }
          const wajib = cnt.lunas + cnt.sebagian + cnt.belum;
          const dit = num((await db.query("SELECT COALESCE(SUM(nominal), 0) AS n FROM iuran_wajib WHERE status = 'sah' AND tanggal BETWEEN ? AND ?", [pr.mulai, pr.akhir])).rows[0].n);
          iuran = {
            aktif: true, nominal: ci.nominalNow, periode: { mulai: pr.mulai, akhir: pr.akhir, weton: I.weton(pr.mulai) },
            warga_wajib: wajib, ...cnt, persen_lunas: wajib ? Math.round((cnt.lunas / wajib) * 100) : 0,
            diterima_periode: dit, tunggakan_total: tungg, warga_menunggak: nTung, titipan: titip
          };
        }
      } catch (_) { /* tabel iuran belum dimigrasi */ }

      return {
        tanggal: today,
        kas, iuran, jimpitan_hari_ini: { total: num(hariIni.n), warga: num(hariIni.w) },
        bulan,
        nama_web: pengaturan.nama_web || 'RW 03 DUKUH PENCIL, MUNGGUNG, KARANGDOWO',
        subjudul: pengaturan.subjudul || '',
        cek_tunggakan_aktif: pengaturan.cek_tunggakan_publik !== '0',
        rt,
        total_warga: totalWarga,
        total_bulan_ini: rt.reduce((a, r) => a + r.total_bulan_ini, 0),
        total_bulan_lalu: lalu,
        warga_menyetor: rt.reduce((a, r) => a + r.warga_menyetor_bulan_ini, 0),
        total_masuk: masuk,
        total_keluar: keluar,
        pengeluaran_bulan_ini: keluarBulan,
        saldo_kas: masuk - keluar,
        kas_sumber: { jimpitan: kasAll.jimpitan, iuran_wajib: kasAll.iuran, sewa_aset: kasAll.sewa, umum: kasAll.umum },
        tunggakan: { total: tunggakanTotal, warga_menunggak: menunggak, persen_lunas: totalWarga ? Math.round(((totalWarga - menunggak) / totalWarga) * 100) : 0, titipan },
        tren: b6.map((b) => ({ bulan: b, total: tMap.get(b) || 0 })),
        kepatuhan,
        tarif: [{ jenis: 'harian', nominal: ctx.tarifNow }],
        tarif_belum_diatur: ctx.tarifNow > 0 ? [] : ['harian']
      };
    }
  }
});
