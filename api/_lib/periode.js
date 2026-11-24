/**
 * Perhitungan periode jimpitan. Semua tanggal berupa string 'YYYY-MM-DD' (WIB),
 * dihitung dalam UTC agar bebas pengaruh zona waktu server.
 *   harian   : kunci '2026-11-21'
 *   mingguan : kunci '2026-W47' (ISO, Senin–Minggu)
 *   bulanan  : kunci '2026-11'
 */
const pad = (n) => String(n).padStart(2, '0');
const DAY = 86400000;

function parse(s) {
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function fmt(d) {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
function addDays(s, n) {
  return fmt(new Date(parse(s).getTime() + n * DAY));
}
function validDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s))) return false;
  return fmt(parse(s)) === s;
}
function todayWIB() {
  return fmt(new Date(Date.now() + 7 * 3600 * 1000));
}

function isoWeek(s) {
  const t = parse(s);
  t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7) + 3); // Kamis pekan tsb
  const y = t.getUTCFullYear();
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const w = 1 + Math.round(((t - jan4) / DAY - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
  return { year: y, week: w };
}

function keyFor(jenis, tanggal) {
  if (jenis === 'harian') return tanggal;
  if (jenis === 'bulanan') return tanggal.slice(0, 7);
  const { year, week } = isoWeek(tanggal);
  return `${year}-W${pad(week)}`;
}

// [mulai, akhir] (inklusif) dari sebuah kunci periode
function rangeOf(jenis, key) {
  if (jenis === 'harian') return [key, key];
  if (jenis === 'bulanan') {
    const [y, m] = key.split('-').map(Number);
    return [`${y}-${pad(m)}-01`, fmt(new Date(Date.UTC(y, m, 0)))];
  }
  const m = /^(\d{4})-W(\d{2})$/.exec(key);
  const y = Number(m[1]);
  const w = Number(m[2]);
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const week1Mon = jan4.getTime() - ((jan4.getUTCDay() + 6) % 7) * DAY;
  const start = fmt(new Date(week1Mon + (w - 1) * 7 * DAY));
  return [start, addDays(start, 6)];
}

function validKey(jenis, key) {
  if (typeof key !== 'string') return false;
  if (jenis === 'harian') return validDate(key);
  if (jenis === 'bulanan') return /^\d{4}-(0[1-9]|1[0-2])$/.test(key);
  return /^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/.test(key);
}

/**
 * Daftar kunci periode yang DIMULAI pada rentang [dari, sampai] dan sudah SELESAI pada/ sebelum `selesai`
 * (default = sampai). Penentuan berdasar tanggal mulai periode, sehingga minggu yang melintasi
 * pergantian tahun (mis. 28 Des–3 Jan) tepat masuk ke satu tahun dan tidak ada yang terlewat/ganda.
 */
function periodsWithin(jenis, dari, sampai, selesai) {
  const out = [];
  const akhir = selesai || sampai;
  if (dari > sampai) return out;
  if (jenis === 'harian') {
    const batas = sampai < akhir ? sampai : akhir;
    for (let d = dari; d <= batas; d = addDays(d, 1)) out.push(d);
    return out;
  }
  if (jenis === 'mingguan') {
    // Senin pertama pada/ setelah `dari`
    let cur = dari;
    const dow = (parse(cur).getUTCDay() + 6) % 7; // Senin = 0
    if (dow > 0) cur = addDays(cur, 7 - dow);
    for (; cur <= sampai; cur = addDays(cur, 7)) {
      if (addDays(cur, 6) > akhir) break;
      out.push(keyFor('mingguan', cur));
    }
    return out;
  }
  // bulanan
  let y = Number(dari.slice(0, 4));
  let m = Number(dari.slice(5, 7));
  if (Number(dari.slice(8, 10)) > 1) { m += 1; if (m > 12) { m = 1; y += 1; } }
  for (;;) {
    const key = `${y}-${pad(m)}`;
    const [s, e] = rangeOf('bulanan', key);
    if (s > sampai || e > akhir) break;
    out.push(key);
    m += 1; if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

const LABEL_BULAN = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
function labelPeriode(jenis, key) {
  if (jenis === 'harian') {
    const [y, m, d] = key.split('-');
    return `${Number(d)} ${LABEL_BULAN[Number(m) - 1].slice(0, 3)} ${y}`;
  }
  if (jenis === 'bulanan') {
    const [y, m] = key.split('-');
    return `${LABEL_BULAN[Number(m) - 1]} ${y}`;
  }
  const [s, e] = rangeOf('mingguan', key);
  return `Minggu ${key.slice(-2)} (${s.slice(8)}/${s.slice(5, 7)}–${e.slice(8)}/${e.slice(5, 7)}/${e.slice(0, 4)})`;
}

module.exports = { parse, fmt, addDays, validDate, todayWIB, isoWeek, keyFor, rangeOf, validKey, periodsWithin, labelPeriode };
