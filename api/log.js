const db = require('./db');
const { route, butuh } = require('./_lib/http');

module.exports = route({
  GET: {
    auth: butuh('sistem.kelola'),
    fn: async (req) => {
      const limit = Math.min(parseInt((req.query || {}).limit, 10) || 100, 500);
      const r = await db.query(
        `SELECT id, waktu, username, nama, role, aksi, deskripsi, ip_address
         FROM log_aktivitas ORDER BY id DESC LIMIT ${limit}`
      );
      return { log: r.rows };
    }
  }
});
