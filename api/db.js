/**
 * Koneksi database MySQL / MariaDB (XAMPP, 10.4+) untuk database `webrw3`.
 *
 * Modul ini mempertahankan antarmuka lama (query, transaction, isConfigured, pool)
 * sehingga endpoint di /api tidak perlu berubah banyak. Query ditulis dengan gaya
 * PostgreSQL ($1, ON CONFLICT, RETURNING, JSONB, ...) lalu diterjemahkan otomatis
 * ke dialek MariaDB oleh fungsi translate() di bawah.
 *
 * Konfigurasi (environment / file .env):
 *   DATABASE_URL = mysql://user:pass@host:3306/nama_db
 *   atau DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME, DB_SOCKET
 */
let mysql = null;
try {
  mysql = require('mysql2/promise');
} catch (e) {
  // mysql2 belum terpasang: jalankan `npm install`
}

function buildConfig() {
  const url = process.env.DATABASE_URL || process.env.MYSQL_URL;
  let cfg = {};
  if (url) {
    const u = new URL(url);
    cfg = {
      host: u.hostname,
      port: u.port ? parseInt(u.port, 10) : 3306,
      user: decodeURIComponent(u.username || 'root'),
      password: decodeURIComponent(u.password || ''),
      database: decodeURIComponent(u.pathname.replace(/^\//, ''))
    };
  } else {
    cfg = {
      host: process.env.DB_HOST || '127.0.0.1',
      port: parseInt(process.env.DB_PORT || '3306', 10),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'webrw3'
    };
  }
  if (process.env.DB_SOCKET) {
    cfg.socketPath = process.env.DB_SOCKET;
    delete cfg.host;
    delete cfg.port;
  }
  return cfg;
}

const config = buildConfig();

// Kolom JSON disimpan sebagai LONGTEXT di MariaDB 10.4 -> parse otomatis saat dibaca.
const JSON_COLUMNS = [];

let pool = null;
if (config && mysql) {
  pool = mysql.createPool({
    ...config,
    waitForConnections: true,
    connectionLimit: parseInt(process.env.DB_POOL || '25', 10),
    queueLimit: 50,
    charset: 'utf8mb4',
    timezone: 'Z',
    dateStrings: ['DATE'],            // DATE tetap berupa 'YYYY-MM-DD' (tanpa geser zona waktu)
    flags: ['+FOUND_ROWS'],           // affectedRows = baris yang cocok (seperti rowCount PostgreSQL)
    typeCast(field, next) {
      if (field.type === 'TINY' && field.length === 1) {
        const v = field.string();
        return v === null ? null : v === '1';
      }
      return next();
    }
  });
  pool.on('connection', (conn) => {
    conn.query("SET time_zone = '+00:00'");
  });
}

/* ---------------------------------------------------------------------------
 * Penerjemah PostgreSQL -> MariaDB
 * ------------------------------------------------------------------------- */
function splitStatements(sql) {
  const out = [];
  let cur = '';
  let quote = null;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (quote) {
      cur += ch;
      if (ch === '\\' && quote !== '`') { cur += sql[++i] || ''; continue; }
      if (ch === quote) quote = null;
    } else if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      cur += ch;
    } else if (ch === ';') {
      if (cur.trim()) out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function translate(sqlIn, paramsIn) {
  let sql = sqlIn;
  let params = paramsIn || [];

  // Placeholder $1,$2 -> ? (urutan param disusun ulang sesuai kemunculan)
  if (params.length && /\$\d+/.test(sql)) {
    const ordered = [];
    sql = sql.replace(/\$(\d+)/g, (_, n) => {
      ordered.push(params[parseInt(n, 10) - 1]);
      return '?';
    });
    params = ordered;
  }

  // Object / array -> string JSON (mysql2 akan mengubah object menjadi "k = v")
  params = params.map((p) =>
    p !== null && typeof p === 'object' && !(p instanceof Date) && !Buffer.isBuffer(p)
      ? JSON.stringify(p)
      : p
  );

  // Tipe data
  sql = sql
    .replace(/'(\[[^']*\]|\{[^']*\})'::jsonb/gi, "'$1'")
    .replace(/::jsonb/gi, '')
    .replace(/\bJSONB\b/gi, 'LONGTEXT')
    .replace(/TIMESTAMP\s+WITH\s+TIME\s+ZONE/gi, 'DATETIME')
    .replace(/\bTIMESTAMPTZ\b/gi, 'DATETIME')
    .replace(/\bDEFAULT\s+CURRENT_DATE\b/gi, 'DEFAULT (CURDATE())')
    .replace(/\bDEFAULT\s+NOW\(\)/gi, 'DEFAULT CURRENT_TIMESTAMP');

  // Cek keberadaan tabel
  sql = sql
    .replace(/SELECT\s+FROM\s+information_schema\.tables/gi, 'SELECT 1 FROM information_schema.tables')
    .replace(/(information_schema\.tables\s+WHERE\s+table_name\s*=\s*'[^']+')/gi, '$1 AND table_schema = DATABASE()')
    .replace(/SELECT\s+EXISTS\s*\(([\s\S]*?)\)\s*;?\s*$/i, 'SELECT EXISTS($1) AS `exists`');

  // UPSERT
  sql = sql.replace(/ON\s+CONFLICT\s*\([^)]*\)\s*DO\s+UPDATE\s+SET/gi, 'ON DUPLICATE KEY UPDATE');
  sql = sql.replace(/EXCLUDED\.(\w+)/gi, 'VALUES($1)');
  if (/ON\s+CONFLICT[^;]*DO\s+NOTHING/i.test(sql)) {
    sql = sql.replace(/ON\s+CONFLICT[^;]*DO\s+NOTHING/gi, '').replace(/INSERT\s+INTO/i, 'INSERT IGNORE INTO');
  }

  // count(*) tanpa alias -> alias "count"
  sql = sql.replace(/SELECT\s+count\(\*\)\s+FROM/gi, 'SELECT COUNT(*) AS count FROM');

  return { sql, params };
}

// RETURNING tidak ada di MariaDB 10.4: jalankan tulis lalu SELECT ulang baris terkait.
function extractReturning(sql, params) {
  const m = sql.match(/\s+RETURNING\s+([\s\S]+?)\s*;?\s*$/i);
  if (!m) return null;
  const cols = m[1].trim();
  const bare = sql.slice(0, m.index);
  const ins = bare.match(/^\s*INSERT\s+(?:IGNORE\s+)?INTO\s+(\w+)/i);
  const upd = bare.match(/^\s*UPDATE\s+(\w+)/i);
  const table = (ins || upd || [])[1];
  if (!table) return null;

  let id;
  if (ins) {
    id = params[0]; // kolom pertama semua tabel adalah id
  } else {
    // Ambil nilai id dari "WHERE id = ?" (hitung posisi ? sebelum klausa itu)
    const w = bare.match(/WHERE\s+id\s*=\s*\?/i);
    if (!w) return null;
    const before = bare.slice(0, w.index + w[0].length);
    id = params[(before.match(/\?/g) || []).length - 1];
  }
  return { bare, table, cols, id };
}

function normalizeRows(rows) {
  for (const r of rows) {
    for (const k of JSON_COLUMNS) {
      if (typeof r[k] === 'string' && /^\s*[\[{]/.test(r[k])) {
        try { r[k] = JSON.parse(r[k]); } catch (_) { /* biarkan string */ }
      }
    }
  }
  return rows;
}

async function run(executor, sqlIn, paramsIn) {
  // Beberapa pernyataan sekaligus (DDL / seed) dijalankan satu per satu.
  if (!paramsIn || !paramsIn.length) {
    const parts = splitStatements(sqlIn);
    if (parts.length > 1) {
      let last;
      for (const p of parts) last = await run(executor, p, []);
      return last;
    }
  }

  const { sql, params } = translate(sqlIn, paramsIn);
  const ret = extractReturning(sql, params);

  if (ret) {
    const [header] = await executor.query(ret.bare, params);
    const [rows] = await executor.query(`SELECT ${ret.cols} FROM ${ret.table} WHERE id = ?`, [ret.id]);
    return { rows: normalizeRows(rows), rowCount: header.affectedRows };
  }

  const [result] = await executor.query(sql, params);
  if (Array.isArray(result)) {
    return { rows: normalizeRows(result), rowCount: result.length };
  }
  return { rows: [], rowCount: result.affectedRows || 0, insertId: result.insertId };
}

const NOT_CONFIGURED =
  'DATABASE_NOT_CONFIGURED: Belum ada konfigurasi MySQL (DATABASE_URL atau DB_*) di file .env.';

async function query(text, params) {
  if (!pool) throw new Error(NOT_CONFIGURED);
  return run(pool, text, params);
}

// Jalankan fungsi dalam SATU transaksi pada SATU koneksi khusus.
async function transaction(fn) {
  if (!pool) throw new Error(NOT_CONFIGURED);
  const conn = await pool.getConnection();
  const client = { query: (text, params) => run(conn, text, params) };
  try {
    await conn.beginTransaction();
    const result = await fn(client);
    await conn.commit();
    return result;
  } catch (e) {
    try { await conn.rollback(); } catch (_) { /* abaikan */ }
    throw e;
  } finally {
    conn.release();
  }
}

module.exports = {
  query,
  transaction,
  isConfigured: !!config,
  pool,
  _translate: translate // untuk pengujian
};
