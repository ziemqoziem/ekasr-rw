const db = require('./db');
const { route, fail, str, int, oneOf, scopeRt, RT_LIST, JENIS_LIST, butuh } = require('./_lib/http');
const { punya } = require('./_lib/izin');
const { catat } = require('./_lib/util');
const P = require('./_lib/periode');

const COLS = 'id, nama, rt, jenis, no_hp, alamat, mulai_iuran, berhenti_pada, aktif, ikut_jimpitan, jimpitan_berhenti, ikut_iuran, iuran_berhenti, ikut_tabungan, catatan';

// Kolom `ikut_tabungan` ditambahkan otomatis bila belum ada (tanpa perlu menjalankan migrasi manual)
let kolomSiap = null;
const pastikanKolom = () => kolomSiap || (kolomSiap = (async () => {
  const r = await db.query("SELECT 1 AS ada FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'warga' AND COLUMN_NAME = 'ikut_tabungan'");
  if (!r.rows.length) await db.query('ALTER TABLE warga ADD COLUMN ikut_tabungan TINYINT(1) NOT NULL DEFAULT 0');
})().catch((e) => { kolomSiap = null; throw e; }));

function bacaBool(b, key, curDefault) {
  const asBool = (v) => v === true || v === 1 || v === '1' || v === 'true';
  if (b[key] !== undefined) return asBool(b[key]) ? 1 : 0;
  return curDefault ? 1 : 0;
}

function bersihHp(v) {
  const s = str(v, 'No HP', { max: 20 }).replace(/[\s-]/g, '');
  if (s && !/^\+?\d{8,15}$/.test(s)) throw fail(400, 'No HP tidak valid (8–15 digit).');
  return s || null;
}
function tanggalOpsional(v, nama) {
  if (v === undefined || v === null || v === '') return null;
  if (!P.validDate(String(v))) throw fail(400, `${nama} tidak valid (format YYYY-MM-DD).`);
  return String(v);
}

// Keikutsertaan program: ikut=1 wajib; ikut=0 + tanggal = wajib sampai tanggal itu; ikut=0 tanpa tanggal = bebas sejak awal
function bacaProgram(b, ikutKey, sampaiKey, cur) {
  const asBool = (v) => v === true || v === 1 || v === '1' || v === 'true';
  const ikut = b[ikutKey] !== undefined ? (asBool(b[ikutKey]) ? 1 : 0) : (cur[ikutKey] === 0 || cur[ikutKey] === false ? 0 : 1);
  let sampai = b[sampaiKey] !== undefined ? tanggalOpsional(b[sampaiKey], 'Tanggal berhenti wajib') : (cur[sampaiKey] ? String(cur[sampaiKey]).slice(0, 10) : null);
  if (ikut) sampai = null;
  return [ikut, sampai];
}

module.exports = route({
  GET: {
    // Menu Warga & data lengkap hanya untuk yang berizin warga.lihat (admin). Peran jimpitan/iuran mendapat daftar ringkas
    // (id, nama, RT, jenis) agar dapat memilih warga di Kalender — tanpa no HP, alamat, atau catatan.
    auth: butuh('warga.lihat', 'jimpitan.lihat', 'iuran.lihat'),
    fn: async (req, res, user) => {
      await pastikanKolom();
      const q = req.query || {};
      const rt = scopeRt(user, q.rt ? oneOf(String(q.rt), 'RT', RT_LIST) : null);
      const where = [];
      const params = [];
      if (rt) { where.push('rt = ?'); params.push(rt); }
      if (q.jenis) { where.push('jenis = ?'); params.push(oneOf(String(q.jenis), 'Jenis', JENIS_LIST)); }
      const aktif = q.aktif === undefined ? '1' : String(q.aktif);
      if (aktif === '1' || aktif === '0') { where.push('aktif = ?'); params.push(Number(aktif)); }
      if (q.ikut_iuran === '1' || q.ikut_iuran === '0') { where.push('ikut_iuran = ?'); params.push(Number(q.ikut_iuran)); }
      if (q.ikut_jimpitan === '1' || q.ikut_jimpitan === '0') { where.push('ikut_jimpitan = ?'); params.push(Number(q.ikut_jimpitan)); }
      if (q.q) { where.push('nama LIKE ?'); params.push(`%${String(q.q).slice(0, 60).replace(/[%_]/g, '')}%`); }
      const r = await db.query(
        `SELECT ${COLS} FROM warga ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY rt, id`,
        params
      );
      if (!punya(user, 'warga.lihat')) {
        return { warga: r.rows.map((w) => ({ id: w.id, nama: w.nama, rt: w.rt, jenis: w.jenis, aktif: w.aktif })), ringkas: true };
      }
      return { warga: r.rows };
    }
  },
  POST: {
    auth: butuh('warga.kelola'),
    status: 201,
    fn: async (req, res, user) => {
      await pastikanKolom();
      const b = req.body || {};
      const nama = str(b.nama, 'Nama', { min: 2, max: 150, required: true }).toUpperCase();
      const rt = oneOf(b.rt, 'RT', RT_LIST);
      const jenis = oneOf(b.jenis, 'Jenis', JENIS_LIST);
      const noHp = bersihHp(b.no_hp);
      const alamat = str(b.alamat, 'Alamat', { max: 200 }) || null;
      const mulai = tanggalOpsional(b.mulai_iuran, 'Tanggal mulai iuran');
      const catatan = str(b.catatan, 'Catatan', { max: 255 }) || null;
      const [ikutJ, sampaiJ] = bacaProgram(b, 'ikut_jimpitan', 'jimpitan_berhenti', {});
      const [ikutI, sampaiI] = bacaProgram(b, 'ikut_iuran', 'iuran_berhenti', {});
      const ikutT = bacaBool(b, 'ikut_tabungan', 0);
      const next = (await db.query('SELECT COALESCE(MAX(id), 0) + 1 AS n FROM warga')).rows[0].n;
      await db.query(
        `INSERT INTO warga (id, nama, rt, jenis, no_hp, alamat, mulai_iuran, catatan, ikut_jimpitan, jimpitan_berhenti, ikut_iuran, iuran_berhenti, ikut_tabungan)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [next, nama, rt, jenis, noHp, alamat, mulai, catatan, ikutJ, sampaiJ, ikutI, sampaiI, ikutT]
      );
      await catat(user, 'TAMBAH_WARGA', `Menambah warga #${next} ${nama} (RT ${rt}, ${jenis}).`, req);
      const row = await db.query(`SELECT ${COLS} FROM warga WHERE id = ?`, [next]);
      return { warga: row.rows[0] };
    }
  },
  PUT: {
    auth: butuh('warga.kelola'),
    fn: async (req, res, user) => {
      await pastikanKolom();
      const b = req.body || {};
      const id = int(b.id, 'ID', { min: 1 });
      const cur = (await db.query(`SELECT ${COLS} FROM warga WHERE id = ?`, [id])).rows[0];
      if (!cur) throw fail(404, 'Warga tidak ditemukan.');
      const nama = b.nama !== undefined ? str(b.nama, 'Nama', { min: 2, max: 150, required: true }).toUpperCase() : cur.nama;
      const rt = b.rt !== undefined ? oneOf(b.rt, 'RT', RT_LIST) : cur.rt;
      const jenis = b.jenis !== undefined ? oneOf(b.jenis, 'Jenis', JENIS_LIST) : cur.jenis;
      const noHp = b.no_hp !== undefined ? bersihHp(b.no_hp) : cur.no_hp;
      const alamat = b.alamat !== undefined ? (str(b.alamat, 'Alamat', { max: 200 }) || null) : cur.alamat;
      const mulai = b.mulai_iuran !== undefined ? tanggalOpsional(b.mulai_iuran, 'Tanggal mulai iuran') : (cur.mulai_iuran ? String(cur.mulai_iuran).slice(0, 10) : null);
      const catatan = b.catatan !== undefined ? (str(b.catatan, 'Catatan', { max: 255 }) || null) : cur.catatan;
      const aktif = b.aktif !== undefined ? (b.aktif ? 1 : 0) : (cur.aktif ? 1 : 0);
      // Warga nonaktif: kewajiban harian berhenti pada tanggal itu; diaktifkan lagi → kewajiban berlanjut
      const [ikutJ, sampaiJ] = bacaProgram(b, 'ikut_jimpitan', 'jimpitan_berhenti', cur);
      const [ikutI, sampaiI] = bacaProgram(b, 'ikut_iuran', 'iuran_berhenti', cur);
      const ikutT = bacaBool(b, 'ikut_tabungan', cur.ikut_tabungan);
      const berhenti = aktif ? null : (cur.berhenti_pada ? String(cur.berhenti_pada).slice(0, 10) : P.todayWIB());
      await db.query(
        `UPDATE warga SET nama = ?, rt = ?, jenis = ?, no_hp = ?, alamat = ?, mulai_iuran = ?, catatan = ?, aktif = ?, berhenti_pada = ?,
         ikut_jimpitan = ?, jimpitan_berhenti = ?, ikut_iuran = ?, iuran_berhenti = ?, ikut_tabungan = ?, updated_at = NOW()
         WHERE id = ?`,
        [nama, rt, jenis, noHp, alamat, mulai, catatan, aktif, berhenti, ikutJ, sampaiJ, ikutI, sampaiI, ikutT, id]
      );
      await catat(user, 'UBAH_WARGA', `Mengubah warga #${id} ${nama} (RT ${rt}, ${jenis}, ${aktif ? 'aktif' : 'nonaktif'}; jimpitan ${ikutJ ? 'wajib' : (sampaiJ ? 'sampai ' + sampaiJ : 'bebas')}, iuran kas ${ikutI ? 'wajib' : (sampaiI ? 'sampai ' + sampaiI : 'bebas')}, tabungan ${ikutT ? 'ya' : 'tidak'}).`, req);
      const row = await db.query(`SELECT ${COLS} FROM warga WHERE id = ?`, [id]);
      return { warga: row.rows[0] };
    }
  }
});
