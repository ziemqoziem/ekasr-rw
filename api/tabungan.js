const db = require('./db');
const { route, fail, str, int, oneOf, scopeRt, cekRtWarga, RT_LIST, butuh } = require('./_lib/http');
const { catat } = require('./_lib/util');
const I = require('./_lib/iuran');
const P = require('./_lib/periode');
const L = require('./_lib/laporan');
const T = require('./_lib/tabungan');

const MAKS_KOLOM = 12;

function daftarPeriode(today) {
  return L.daftarPeriode(today).map((x) => {
    const p = I.periodeDari(x.tanggal);
    return { mulai: p.mulai, akhir: p.akhir, tanggal: x.tanggal, weton: x.weton, no: x.no, berjalan: !!(x.berjalan || x.hari_ini), hari_ini: !!x.hari_ini };
  });
}

async function ambilWarga(id) {
  const w = (await db.query('SELECT id, nama, rt, aktif, ikut_tabungan FROM warga WHERE id = ?', [id])).rows[0];
  if (!w) throw fail(404, 'Warga tidak ditemukan.');
  return w;
}

module.exports = route({
  /**
   * Papan tabungan untuk satu periode kumpulan (default: periode berjalan).
   * Status per warga: sudah (ada setoran di kumpulan ini) | belum. Saldo = total setor − total tarik.
   */
  GET: {
    auth: butuh('tabungan.lihat'),
    fn: async (req, res, user) => {
      await T.siapTabel();
      const q = req.query || {};
      const today = P.todayWIB();
      const daftar = daftarPeriode(today);
      const sekarang = I.periodeDari(today);
      let periode = sekarang;
      if (q.periode) {
        if (!P.validDate(String(q.periode))) throw fail(400, 'Periode tidak valid.');
        const pilih = I.periodeDari(String(q.periode));
        if (daftar.some((x) => x.mulai === pilih.mulai)) periode = pilih;
      }
      const meta = daftar.find((x) => x.mulai === periode.mulai);
      const info = {
        mulai: periode.mulai, akhir: periode.akhir, weton: I.weton(periode.mulai),
        berjalan: !!(meta && meta.berjalan) || periode.mulai === sekarang.mulai, no: meta ? meta.no : null
      };
      // Riwayat transaksi satu warga (dialog): sampai akhir kumpulan terpilih, dengan saldo berjalan
      if (q.warga_id) {
        const w = await ambilWarga(int(q.warga_id, 'Warga', { min: 1 }));
        cekRtWarga(user, w.rt);
        const tx = await db.query(
          `SELECT id, tanggal, jenis, nominal, metode, petugas, catatan, status, alasan_batal FROM tabungan
           WHERE warga_id = ? AND tanggal <= ? ORDER BY tanggal ASC, created_at ASC`, [w.id, periode.akhir]
        );
        let run = 0;
        const semua = tx.rows.map((x) => {
          const nominal = Number(x.nominal), tanggal = String(x.tanggal).slice(0, 10);
          if (x.status === 'sah') run += x.jenis === 'setor' ? nominal : -nominal;
          return { ...x, nominal, tanggal, saldo_akhir: run, dalam_periode: tanggal >= periode.mulai };
        });
        const sd = (await T.saldoWarga([w.id], periode.akhir)).get(w.id) || { saldo: 0, setor: 0, tarik: 0 };
        const aktual = (await T.saldoWarga([w.id])).get(w.id) || { saldo: 0 };
        return {
          warga: { id: w.id, nama: w.nama, rt: w.rt }, periode: info, ...sd, saldo_aktual: aktual.saldo,
          transaksi: semua.reverse().slice(0, 150)
        };
      }
      // Kolom riwayat: kumpulan terpilih dan sebelumnya (maks 12), urut lama → baru
      const kolom = daftar.filter((x) => x.mulai <= periode.mulai).slice(0, MAKS_KOLOM).reverse()
        .map((x) => ({ mulai: x.mulai, akhir: x.akhir, no: x.no, terpilih: x.mulai === periode.mulai }));

      const rt = scopeRt(user, q.rt ? oneOf(String(q.rt), 'RT', RT_LIST) : null);
      const where = ["w.aktif = 1", "(w.ikut_tabungan = 1 OR w.id IN (SELECT warga_id FROM tabungan WHERE status = 'sah'))"];
      const params = [];
      if (rt) { where.push('w.rt = ?'); params.push(rt); }
      const wr = await db.query(`SELECT w.id, w.nama, w.rt, w.jenis, w.no_hp, w.ikut_tabungan FROM warga w WHERE ${where.join(' AND ')} ORDER BY w.rt, w.id`, params);
      const ids = wr.rows.map((w) => w.id);
      const saldo = ids.length ? await T.saldoWarga(ids, periode.akhir) : new Map();   // saldo s.d. akhir kumpulan terpilih
      const tm = new Map();
      if (ids.length && kolom.length) {
        const tx = await db.query(
          `SELECT id, warga_id, tanggal, jenis, nominal FROM tabungan
           WHERE status = 'sah' AND tanggal BETWEEN ? AND ? AND warga_id IN (${ids.map(() => '?').join(',')}) ORDER BY tanggal, created_at`,
          [kolom[0].mulai, periode.akhir, ...ids]
        );
        for (const x of tx.rows) {
          if (!tm.has(x.warga_id)) tm.set(x.warga_id, []);
          tm.get(x.warga_id).push({ id: x.id, tanggal: String(x.tanggal).slice(0, 10), jenis: x.jenis, nominal: Number(x.nominal) });
        }
      }
      const cnt = { sudah: 0, belum: 0 };
      let setorP = 0, tarikP = 0, saldoTotal = 0;
      const rows = wr.rows.map((w) => {
        const list = tm.get(w.id) || [];
        const dalam = list.filter((x) => x.tanggal >= periode.mulai && x.tanggal <= periode.akhir);
        const sP = dalam.filter((x) => x.jenis === 'setor').reduce((a, x) => a + x.nominal, 0);
        const tP = dalam.filter((x) => x.jenis === 'tarik').reduce((a, x) => a + x.nominal, 0);
        const s = saldo.get(w.id) || { saldo: 0, setor: 0, tarik: 0 };
        const status = sP > 0 ? 'sudah' : 'belum';
        cnt[status] += 1;
        setorP += sP; tarikP += tP; saldoTotal += s.saldo;
        const riwayat = kolom.map((k) => {
          const n = list.filter((x) => x.jenis === 'setor' && x.tanggal >= k.mulai && x.tanggal <= k.akhir).reduce((a, x) => a + x.nominal, 0);
          return { mulai: k.mulai, status: n > 0 ? 'sudah' : 'belum', nominal: n };
        });
        return {
          id: w.id, nama: w.nama, rt: w.rt, jenis: w.jenis, no_hp: w.no_hp, ikut: !!w.ikut_tabungan, status,
          setor_periode: sP, tarik_periode: tP, saldo: s.saldo, total_setor: s.setor, total_tarik: s.tarik,
          setoran: dalam, riwayat
        };
      });
      return {
        periode: info, periode_daftar: daftar, kolom,
        ringkasan: { total_warga: rows.length, ...cnt, setor_periode: setorP, tarik_periode: tarikP, saldo_total: saldoTotal },
        warga: rows
      };
    }
  },

  // Catat satu setoran atau penarikan
  POST: {
    auth: butuh('tabungan.tulis'),
    status: 201,
    fn: async (req, res, user) => {
      await T.siapTabel();
      const b = req.body || {};
      const warga = await ambilWarga(int(b.warga_id, 'Warga', { min: 1 }));
      cekRtWarga(user, warga.rt);
      if (!warga.aktif) throw fail(400, 'Warga ini sudah nonaktif.');
      const today = P.todayWIB();
      const tanggal = b.tanggal ? String(b.tanggal) : today;
      if (!P.validDate(tanggal)) throw fail(400, 'Tanggal tidak valid.');
      if (tanggal > today) throw fail(400, 'Tanggal tidak boleh di masa depan.');
      const catatan = str(b.catatan, 'Catatan', { max: 255 }) || null;
      const h = await T.simpanTabungan({ user, warga, tanggal, jenis: b.jenis, nominal: b.nominal, metode: b.metode, catatan, abaikanDuplikat: !!b.abaikan_duplikat });
      await catat(user, h.jenis === 'tarik' ? 'TARIK_TABUNGAN' : 'SETOR_TABUNGAN', `${h.jenis === 'tarik' ? 'Penarikan' : 'Setoran'} tabungan ${warga.nama} (RT ${warga.rt}) Rp ${h.nominal} tanggal ${tanggal} (${h.id}).`, req);
      return { id: h.id, nominal: h.nominal, jenis: h.jenis };
    }
  },

  // Batalkan (tidak dihapus; alasan tercatat). Setoran tidak bisa dibatalkan bila membuat saldo negatif.
  PUT: {
    auth: butuh('tabungan.tulis'),
    fn: async (req, res, user) => {
      await T.siapTabel();
      const b = req.body || {};
      const id = str(b.id, 'ID', { max: 40, required: true });
      const alasan = str(b.alasan, 'Alasan pembatalan', { min: 3, max: 255, required: true });
      const s = (await db.query(
        'SELECT t.id, t.warga_id, t.status, t.jenis, t.nominal, t.tanggal, w.nama, w.rt FROM tabungan t JOIN warga w ON w.id = t.warga_id WHERE t.id = ?', [id]
      )).rows[0];
      if (!s) throw fail(404, 'Data tidak ditemukan.');
      if (s.status === 'batal') throw fail(400, 'Sudah dibatalkan.');
      cekRtWarga(user, s.rt);
      if (s.jenis === 'setor') {
        const sd = (await T.saldoWarga([s.warga_id])).get(s.warga_id);
        if ((sd ? sd.saldo : 0) - Number(s.nominal) < 0) throw fail(400, 'Setoran ini tidak dapat dibatalkan karena saldo akan menjadi negatif (sudah ada penarikan). Batalkan penarikan terlebih dahulu.');
      }
      await db.query("UPDATE tabungan SET status = 'batal', alasan_batal = ? WHERE id = ?", [alasan, id]);
      await catat(user, 'BATAL_TABUNGAN', `Membatalkan ${s.jenis} tabungan ${id} (${s.nama}, Rp ${s.nominal}): ${alasan}`, req);
      return { id };
    }
  }
});
