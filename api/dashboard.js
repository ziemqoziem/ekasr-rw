const db = require('./db');
const { route, fail, oneOf, scopeRt, RT_LIST, butuh } = require('./_lib/http');
const { punya } = require('./_lib/izin');
const { totalKas } = require('./_lib/kas');
const { bangunKonteks, hitungSaldo, jatuhTempo } = require('./_lib/util');
const P = require('./_lib/periode');

const num = (v) => Number(v || 0);
const pad = (n) => String(n).padStart(2, '0');

// 12 bulan berakhir di `bulan` (YYYY-MM), urut lama -> baru
function dua_belas_bulan(bulan) {
  let y = Number(bulan.slice(0, 4));
  let m = Number(bulan.slice(5, 7));
  const out = [];
  for (let i = 0; i < 12; i++) {
    out.unshift(`${y}-${pad(m)}`);
    m -= 1;
    if (m === 0) { m = 12; y -= 1; }
  }
  return out;
}

/**
 * Data dashboard: KPI, tren, komposisi, tunggakan, dan tabel ringkas dalam satu panggilan.
 * Petugas otomatis dibatasi ke RT-nya; angka kas (pengeluaran/saldo) hanya untuk admin & bendahara.
 */
module.exports = route({
  GET: {
    auth: butuh('dashboard.lihat'),
    fn: async (req, res, user) => {
      const q = req.query || {};
      const today = P.todayWIB();
      const bulan = q.bulan ? String(q.bulan) : today.slice(0, 7);
      if (!P.validKey('bulanan', bulan)) throw fail(400, 'Bulan tidak valid (format YYYY-MM).');
      const rt = scopeRt(user, q.rt ? oneOf(String(q.rt), 'RT', RT_LIST) : null);
      const keuangan = punya(user, 'kas.lihat');
      const rtSql = rt ? ' AND w.rt = ?' : '';
      const rtPar = rt ? [rt] : [];

      const [awal, akhir] = P.rangeOf('bulanan', bulan);
      const bulanLalu = P.addDays(awal, -1).slice(0, 7);
      const [awalLalu, akhirLalu] = P.rangeOf('bulanan', bulanLalu);

      /* ---- warga aktif (jimpitan) per RT & jenis — untuk partisipasi/tunggakan ---- */
      const wr = await db.query(
        `SELECT w.rt, w.jenis, COUNT(*) AS n FROM warga w WHERE w.aktif = 1 AND (w.ikut_jimpitan = 1 OR w.jimpitan_berhenti IS NOT NULL)${rtSql} GROUP BY w.rt, w.jenis ORDER BY w.rt, w.jenis`,
        rtPar
      );
      const wargaAktif = wr.rows.reduce((a, r) => a + num(r.n), 0);

      /* ---- ringkasan warga per RT (semua program) ---- */
      try { await require('./_lib/tabungan').siapTabel(); } catch (_) { /* opsional */ }
      const wrAll = await db.query(
        `SELECT w.rt,
            COUNT(*) AS aktif,
            SUM(CASE WHEN w.ikut_jimpitan = 1 OR w.jimpitan_berhenti IS NOT NULL THEN 1 ELSE 0 END) AS jimpitan,
            SUM(CASE WHEN w.ikut_iuran = 1 OR w.iuran_berhenti IS NOT NULL THEN 1 ELSE 0 END) AS iuran,
            SUM(CASE WHEN COALESCE(w.ikut_tabungan, 0) = 1 THEN 1 ELSE 0 END) AS tabungan
         FROM warga w WHERE w.aktif = 1${rtSql} GROUP BY w.rt ORDER BY w.rt`,
        rtPar
      );
      const wargaPerRt = wrAll.rows.map((r) => ({
        rt: r.rt, aktif: num(r.aktif), jimpitan: num(r.jimpitan), iuran: num(r.iuran), tabungan: num(r.tabungan)
      }));
      const wargaTotal = wargaPerRt.reduce((a, r) => a + r.aktif, 0);

      /* ---- setoran bulan terpilih: per RT, jenis, metode, tipe ---- */
      const sb = await db.query(
        `SELECT w.rt, w.jenis, s.metode, s.tipe, SUM(s.nominal) AS total, COUNT(*) AS jml
         FROM setoran s JOIN warga w ON w.id = s.warga_id
         WHERE s.status = 'sah' AND s.tanggal BETWEEN ? AND ?${rtSql}
         GROUP BY w.rt, w.jenis, s.metode, s.tipe`,
        [awal, akhir, ...rtPar]
      );
      const menyetor = await db.query(
        `SELECT w.rt, COUNT(DISTINCT s.warga_id) AS n
         FROM setoran s JOIN warga w ON w.id = s.warga_id
         WHERE s.status = 'sah' AND s.tanggal BETWEEN ? AND ?${rtSql} GROUP BY w.rt`,
        [awal, akhir, ...rtPar]
      );
      const lalu = await db.query(
        `SELECT w.rt, SUM(s.nominal) AS total
         FROM setoran s JOIN warga w ON w.id = s.warga_id
         WHERE s.status = 'sah' AND s.tanggal BETWEEN ? AND ?${rtSql} GROUP BY w.rt`,
        [awalLalu, akhirLalu, ...rtPar]
      );

      const perJenis = {};
      const perMetode = {};
      const perTipe = {};
      const rtMap = {};
      const ensureRt = (r) => (rtMap[r] = rtMap[r] || { rt: r, aktif: 0, menyetor: 0, setoran: 0, setoran_lalu: 0, jml: 0, tunggakan_rutin: 0, tunggakan_lama: 0, warga_menunggak: 0, jenis: {} });
      for (const r of wr.rows) { const o = ensureRt(r.rt); o.aktif += num(r.n); o.jenis[r.jenis] = { warga: num(r.n), total: 0, jml: 0 }; }
      let setoranBulan = 0;
      for (const r of sb.rows) {
        const t = num(r.total);
        setoranBulan += t;
        perJenis[r.jenis] = (perJenis[r.jenis] || 0) + t;
        perMetode[r.metode] = (perMetode[r.metode] || 0) + t;
        perTipe[r.tipe] = (perTipe[r.tipe] || 0) + t;
        const o = ensureRt(r.rt);
        o.setoran += t; o.jml += num(r.jml);
        if (!o.jenis[r.jenis]) o.jenis[r.jenis] = { warga: 0, total: 0, jml: 0 };
        o.jenis[r.jenis].total += t; o.jenis[r.jenis].jml += num(r.jml);
      }
      for (const r of menyetor.rows) ensureRt(r.rt).menyetor = num(r.n);
      let setoranLalu = 0;
      for (const r of lalu.rows) { ensureRt(r.rt).setoran_lalu = num(r.total); setoranLalu += num(r.total); }
      const menyetorTotal = menyetor.rows.reduce((a, r) => a + num(r.n), 0);

      /* ---- tren 12 bulan ---- */
      const bulan12 = dua_belas_bulan(bulan);
      const awal12 = `${bulan12[0]}-01`;
      const trenS = await db.query(
        `SELECT DATE_FORMAT(s.tanggal, '%Y-%m') AS b, SUM(s.nominal) AS total
         FROM setoran s JOIN warga w ON w.id = s.warga_id
         WHERE s.status = 'sah' AND s.tanggal BETWEEN ? AND ?${rtSql} GROUP BY b`,
        [awal12, akhir, ...rtPar]
      );
      const sMap = new Map(trenS.rows.map((r) => [r.b, num(r.total)]));
      let kMap = new Map();
      if (keuangan) {
        const trenK = await db.query(
          `SELECT DATE_FORMAT(tanggal, '%Y-%m') AS b, SUM(nominal) AS total
           FROM pengeluaran WHERE status = 'sah' AND tanggal BETWEEN ? AND ? GROUP BY b`,
          [awal12, akhir]
        );
        kMap = new Map(trenK.rows.map((r) => [r.b, num(r.total)]));
      }
      const tren = bulan12.map((b) => ({ bulan: b, setoran: sMap.get(b) || 0, pengeluaran: keuangan ? (kMap.get(b) || 0) : null }));

      /* ---- 30 hari terakhir (berakhir hari ini atau akhir bulan terpilih bila sudah lewat) ---- */
      const akhir30 = akhir < today ? akhir : today;
      const awal30 = P.addDays(akhir30, -29);
      const hr = await db.query(
        `SELECT s.tanggal AS t, SUM(s.nominal) AS total
         FROM setoran s JOIN warga w ON w.id = s.warga_id
         WHERE s.status = 'sah' AND s.tanggal BETWEEN ? AND ?${rtSql} GROUP BY s.tanggal`,
        [awal30, akhir30, ...rtPar]
      );
      const hMap = new Map(hr.rows.map((r) => [String(r.t).slice(0, 10), num(r.total)]));
      const harian = [];
      for (let d = awal30; d <= akhir30; d = P.addDays(d, 1)) harian.push({ tanggal: d, total: hMap.get(d) || 0 });

      /* ---- saldo & tunggakan (model saldo: kewajiban harian, setoran bebas) ---- */
      const ctx = await bangunKonteks();
      const wl = await db.query(
        `SELECT w.id, w.nama, w.rt, w.jenis, w.mulai_iuran, w.berhenti_pada, w.ikut_jimpitan, w.jimpitan_berhenti, w.ikut_iuran, w.iuran_berhenti FROM warga w WHERE w.aktif = 1 AND (w.ikut_jimpitan = 1 OR w.jimpitan_berhenti IS NOT NULL)${rtSql} ORDER BY w.rt, w.id`,
        rtPar
      );
      const saldo = hitungSaldo(wl.rows, ctx);
      const totalJenis = { harian: 0, mingguan: 0, bulanan: 0 };
      const bebasJenis = { harian: 0, mingguan: 0, bulanan: 0 };
      let tRutin = 0, tLama = 0, menunggak = 0, titipan = 0, wargaTitipan = 0;
      const daftarTunggak = [];
      const kurangHarian = new Map(); // warga harian yang masih punya tagihan berjalan (perlu setor)
      let harianKurangN = 0;
      for (const w of wl.rows) {
        const s = saldo.get(w.id);
        totalJenis[w.jenis] += 1;
        if (s.kurang === 0) bebasJenis[w.jenis] += 1;
        const o = ensureRt(w.rt);
        o.tunggakan_rutin += s.berjalan_kurang;
        o.tunggakan_lama += s.lama_sisa;
        tRutin += s.berjalan_kurang;
        tLama += s.lama_sisa;
        if (s.kurang > 0) {
          o.warga_menunggak += 1; menunggak += 1;
          daftarTunggak.push({ id: w.id, nama: w.nama, rt: w.rt, jenis: w.jenis, periode: s.hari_kurang, rutin: s.berjalan_kurang, lama: s.lama_sisa, total: s.kurang });
        }
        if (s.lebih > 0) { titipan += s.lebih; wargaTitipan += 1; }
        if (w.jenis === 'harian' && s.tagihan_berjalan > 0) {
          harianKurangN += 1;
          if (!kurangHarian.has(w.rt)) kurangHarian.set(w.rt, { rt: w.rt, belum: 0, nama: [] });
          const k = kurangHarian.get(w.rt);
          k.belum += 1;
          if (k.nama.length < 6) k.nama.push(w.nama);
        }
      }
      daftarTunggak.sort((a, b) => b.total - a.total);
      const labelTgl = (t) => `${t.slice(8)}/${t.slice(5, 7)}`;
      const kepatuhan = ['harian', 'mingguan', 'bulanan']
        .filter((j) => totalJenis[j] > 0)
        .map((j) => ({ jenis: j, periode: `bebas tunggakan s.d. ${labelTgl(jatuhTempo(j, today))}`, total: totalJenis[j], sudah: bebasJenis[j] }));
      const tindakan = {
        harian_total: totalJenis.harian, harian_belum: harianKurangN, per_rt: [...kurangHarian.values()],
        tarif_belum_diatur: ctx.tarifNow > 0 ? [] : ['harian']
      };

      /* ---- kas (admin & bendahara) ---- */
      let kas = null;
      if (keuangan) {
        const kel = await db.query(
          `SELECT kategori, SUM(nominal) AS total FROM pengeluaran
           WHERE status = 'sah' AND tanggal BETWEEN ? AND ? GROUP BY kategori ORDER BY total DESC`,
          [awal, akhir]
        );
        const kasAll = await totalKas();
        const masuk = kasAll.masuk;
        const keluar = kasAll.keluar;
        const keluarBulan = kel.rows.reduce((a, r) => a + num(r.total), 0);
        const keluarLalu = num((await db.query(
          "SELECT COALESCE(SUM(nominal), 0) AS n FROM pengeluaran WHERE status = 'sah' AND tanggal BETWEEN ? AND ?", [awalLalu, akhirLalu]
        )).rows[0].n);
        kas = {
          saldo: masuk - keluar, total_masuk: masuk, total_keluar: keluar,
          sumber: { jimpitan: kasAll.jimpitan, iuran_wajib: kasAll.iuran, sewa_aset: kasAll.sewa, umum: kasAll.umum },
          pengeluaran_bulan: keluarBulan, pengeluaran_lalu: keluarLalu,
          kategori: kel.rows.map((r) => ({ kategori: r.kategori, total: num(r.total) }))
        };
      }

      /* ---- transaksi bulan: jimpitan, iuran, tabungan, pemasukan lain, pengeluaran ---- */
      const hitungTrx = async (sql, prm) => {
        const r = (await db.query(sql, prm)).rows[0] || {};
        return { total: num(r.total), jumlah: num(r.jumlah) };
      };
      const trxJimpitan = { total: setoranBulan, jumlah: Object.values(rtMap).reduce((a, r) => a + (r.jml || 0), 0) };
      const trxIuran = await hitungTrx(
        `SELECT COALESCE(SUM(i.nominal), 0) AS total, COUNT(*) AS jumlah
         FROM iuran_wajib i JOIN warga w ON w.id = i.warga_id
         WHERE i.status = 'sah' AND i.tanggal BETWEEN ? AND ?${rtSql}`,
        [awal, akhir, ...rtPar]
      );
      let trxTabungan = { setor: 0, tarik: 0, netto: 0, jumlah: 0 };
      try {
        const tb = await db.query(
          `SELECT t.jenis, COALESCE(SUM(t.nominal), 0) AS total, COUNT(*) AS jumlah
           FROM tabungan t JOIN warga w ON w.id = t.warga_id
           WHERE t.status = 'sah' AND t.tanggal BETWEEN ? AND ?${rtSql} GROUP BY t.jenis`,
          [awal, akhir, ...rtPar]
        );
        for (const x of tb.rows) {
          if (x.jenis === 'setor') { trxTabungan.setor = num(x.total); trxTabungan.jumlah += num(x.jumlah); }
          if (x.jenis === 'tarik') { trxTabungan.tarik = num(x.total); trxTabungan.jumlah += num(x.jumlah); }
        }
        trxTabungan.netto = trxTabungan.setor - trxTabungan.tarik;
      } catch (_) { /* tabel belum ada */ }
      const trxSewa = await hitungTrx(
        `SELECT COALESCE(SUM(s.nominal), 0) AS total, COUNT(*) AS jumlah
         FROM sewa_aset s
         WHERE s.status = 'sah' AND s.tanggal BETWEEN ? AND ?${rt ? ' AND (s.rt = ? OR s.rt IS NULL)' : ''}`,
        rt ? [awal, akhir, rt] : [awal, akhir]
      );
      let trxKeluar = { total: 0, jumlah: 0 };
      if (keuangan) {
        trxKeluar = await hitungTrx(
          `SELECT COALESCE(SUM(nominal), 0) AS total, COUNT(*) AS jumlah
           FROM pengeluaran WHERE status = 'sah' AND tanggal BETWEEN ? AND ?`,
          [awal, akhir]
        );
      }
      const transaksi = {
        jimpitan: trxJimpitan,
        iuran_wajib: trxIuran,
        tabungan: trxTabungan,
        pemasukan_lain: trxSewa,
        pengeluaran: trxKeluar,
        masuk: trxJimpitan.total + trxIuran.total + trxSewa.total,
        keluar: trxKeluar.total
      };

      /* ---- setoran terbaru + feed gabungan ---- */
      const baru = await db.query(
        `SELECT s.id, w.nama, w.rt, s.tanggal, s.tipe, s.periode_kunci, s.nominal, s.metode, s.petugas, s.created_at
         FROM setoran s JOIN warga w ON w.id = s.warga_id
         WHERE s.status = 'sah'${rtSql} ORDER BY s.created_at DESC, s.id DESC LIMIT 8`,
        rtPar
      );
      const feed = [];
      for (const r of baru.rows.slice(0, 5)) {
        feed.push({
          jenis: 'jimpitan', judul: r.nama, meta: `RT ${r.rt} · jimpitan`,
          tanggal: String(r.tanggal).slice(0, 10), nominal: num(r.nominal), arah: 'masuk'
        });
      }
      try {
        const fi = await db.query(
          `SELECT w.nama, w.rt, i.tanggal, i.nominal, i.created_at FROM iuran_wajib i JOIN warga w ON w.id = i.warga_id
           WHERE i.status = 'sah'${rtSql} ORDER BY i.created_at DESC LIMIT 4`, rtPar
        );
        for (const r of fi.rows) feed.push({ jenis: 'iuran', judul: r.nama, meta: `RT ${r.rt} · iuran wajib`, tanggal: String(r.tanggal).slice(0, 10), nominal: num(r.nominal), arah: 'masuk' });
      } catch (_) { /* abaikan */ }
      try {
        const ft = await db.query(
          `SELECT w.nama, w.rt, t.tanggal, t.jenis, t.nominal, t.created_at FROM tabungan t JOIN warga w ON w.id = t.warga_id
           WHERE t.status = 'sah'${rtSql} ORDER BY t.created_at DESC LIMIT 4`, rtPar
        );
        for (const r of ft.rows) feed.push({ jenis: 'tabungan', judul: r.nama, meta: `RT ${r.rt} · tabungan ${r.jenis}`, tanggal: String(r.tanggal).slice(0, 10), nominal: num(r.nominal), arah: r.jenis === 'tarik' ? 'keluar' : 'masuk' });
      } catch (_) { /* abaikan */ }
      if (keuangan) {
        try {
          const fk = await db.query(
            `SELECT tanggal, uraian, nominal, created_at FROM pengeluaran WHERE status = 'sah' ORDER BY created_at DESC LIMIT 3`
          );
          for (const r of fk.rows) feed.push({ jenis: 'pengeluaran', judul: r.uraian, meta: 'pengeluaran', tanggal: String(r.tanggal).slice(0, 10), nominal: num(r.nominal), arah: 'keluar' });
        } catch (_) { /* abaikan */ }
        try {
          const fs = await db.query(
            `SELECT tanggal, uraian, nominal, rt, created_at FROM sewa_aset WHERE status = 'sah' ORDER BY created_at DESC LIMIT 3`
          );
          for (const r of fs.rows) feed.push({ jenis: 'pemasukan', judul: r.uraian, meta: r.rt ? `RT ${r.rt} · pemasukan lain` : 'pemasukan lain', tanggal: String(r.tanggal).slice(0, 10), nominal: num(r.nominal), arah: 'masuk' });
        } catch (_) { /* abaikan */ }
      }
      feed.sort((a, b) => String(b.tanggal).localeCompare(String(a.tanggal)));

      return {
        bulan, rt, dibuat: new Date().toISOString(), keuangan,
        kpi: {
          setoran_bulan: setoranBulan, setoran_lalu: setoranLalu,
          warga_aktif: wargaAktif, warga_total: wargaTotal, warga_menyetor: menyetorTotal,
          partisipasi: wargaAktif ? Math.round((menyetorTotal / wargaAktif) * 100) : 0,
          tunggakan_total: tRutin + tLama, tunggakan_rutin: tRutin, tunggakan_lama: tLama, warga_menunggak: menunggak,
          titipan_total: titipan, warga_titipan: wargaTitipan
        },
        transaksi,
        warga_per_rt: wargaPerRt,
        tindakan,
        tren, harian, kepatuhan,
        per_rt: Object.values(rtMap).sort((a, b) => a.rt.localeCompare(b.rt)),
        per_jenis: Object.entries(perJenis).map(([jenis, total]) => ({ jenis, total })),
        per_metode: Object.entries(perMetode).map(([metode, total]) => ({ metode, total })),
        per_tipe: Object.entries(perTipe).map(([tipe, total]) => ({ tipe, total })),
        top_tunggakan: daftarTunggak.slice(0, 10),
        kas,
        terbaru: baru.rows.map((r) => ({ ...r, tanggal: String(r.tanggal).slice(0, 10) })),
        feed: feed.slice(0, 10)
      };
    }
  }
});
