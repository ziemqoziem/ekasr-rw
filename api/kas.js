const { route, fail, oneOf, butuh } = require('./_lib/http');
const { totalKas, totalRentang, bukuKas } = require('./_lib/kas');
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

      const awal = await totalKas(P.addDays(dari, -1));
      const baris = await bukuKas(dari, sampai, sumber);
      let saldo = sumber ? 0 : awal.saldo;
      let masuk = 0, keluar = 0;
      for (const b of baris) { saldo += b.masuk - b.keluar; masuk += b.masuk; keluar += b.keluar; b.saldo = saldo; }

      const periodeList = I.periodeTerakhir(today, 12);
      const per_periode = [];
      for (const p of periodeList) {
        const akhir = p.akhir < today ? p.akhir : today;
        const t = await totalRentang(p.mulai, akhir);
        const sa = await totalKas(akhir);
        per_periode.push({ mulai: p.mulai, akhir: p.akhir, weton: I.weton(p.mulai), berjalan: p.akhir >= today, ...t, saldo_akhir: sa.saldo });
      }
      return {
        dari, sampai, sumber, saldo_awal: sumber ? null : awal.saldo, baris,
        total_masuk: masuk, total_keluar: keluar, saldo_akhir: sumber ? null : saldo,
        saldo_kas: await totalKas(), per_periode
      };
    }
  }
});
