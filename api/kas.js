const { route, fail, oneOf, butuh } = require('./_lib/http');
const { createKasMemo, bukuKas } = require('./_lib/kas');
const L = require('./_lib/laporan');
const I = require('./_lib/iuran');
const P = require('./_lib/periode');

const SUMBER = ['jimpitan', 'iuran_wajib', 'sewa_aset', 'pengeluaran'];

/**
 * BUKU KAS TUNGGAL RW (bendahara RW; admin hanya melihat).
 * Gabungan otomatis dari jimpitan + iuran wajib + pemasukan lainnya dan pengeluaran — tanpa tabel ganda.
 *   ?dari=&sampai=&sumber=   → buku kas kronologis dengan saldo berjalan
 *   per_periode              → ringkasan tiap periode kumpulan (Selasa Kliwon), 8 terakhir
 */
module.exports = route({
  GET: {
    auth: butuh('kas.lihat'),
    fn: async (req) => {
      const q = req.query || {};
      const today = P.todayWIB();
      const per = I.periodeDari(today);
      const dari = q.dari ? String(q.dari) : per.mulai;
      const sampai = q.sampai ? String(q.sampai) : today;
      if (!P.validDate(dari) || !P.validDate(sampai)) throw fail(400, 'Rentang tanggal tidak valid.');
      if (dari > sampai) throw fail(400, 'Tanggal "dari" harus sebelum "sampai".');
      const sumber = q.sumber ? oneOf(String(q.sumber), 'Sumber', SUMBER) : null;

      const memo = createKasMemo();
      const awal = await memo.totalKas(P.addDays(dari, -1));
      const baris = await bukuKas(dari, sampai, sumber);
      let saldo = sumber ? 0 : awal.saldo;
      let masuk = 0, keluar = 0;
      for (const b of baris) { saldo += b.masuk - b.keluar; masuk += b.masuk; keluar += b.keluar; b.saldo = saldo; }

      // Sama dengan halaman Laporan: kumpulan K = cut off pada tanggal K (transaksi sejak K-34 s.d. K).
      // Kumpulan ke-1 dihitung sejak saldo awal berlaku; kumpulan berjalan dihitung sampai hari ini.
      // Saldo akhir = saldo awal (saldo akhir kumpulan sebelumnya) + pemasukan − pengeluaran.
      const per_periode = [];
      for (const x of L.daftarPeriode(today).slice(0, 12)) {
        const akhir = x.akhir < today ? x.akhir : today;
        let mulai = x.mulai;
        let saldoAwal;
        const basis = x.no === 1 ? await memo.basisAwal(akhir) : null;
        if (basis) { mulai = basis.mulai; saldoAwal = Object.values(basis.awal).reduce((a, v) => a + v, 0); }
        else saldoAwal = (await memo.totalKas(P.addDays(x.mulai, -1))).saldo;
        const t = await memo.totalRentang(mulai, akhir);
        const sa = await memo.totalKas(akhir);
        per_periode.push({ no: x.no, tanggal: x.tanggal, mulai, akhir: x.akhir, weton: x.weton, berjalan: x.akhir >= today, saldo_awal: saldoAwal, ...t, saldo_akhir: sa.saldo });
      }
      return {
        dari, sampai, sumber, saldo_awal: sumber ? null : awal.saldo, baris,
        total_masuk: masuk, total_keluar: keluar, saldo_akhir: sumber ? null : saldo,
        saldo_kas: await memo.totalKas(), per_periode
      };
    }
  }
});
