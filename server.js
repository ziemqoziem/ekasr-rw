/**
 * Server Node.js (Express) — Jimpitan RW 03 Dukuh Pencil, Munggung, Karangdowo.
 *   npm install
 *   cp .env.example .env
 *   npm run init-db
 *   npm start
 */
const fs = require('fs');
const path = require('path');
require('./api/_lib/env').loadEnv();

const express = require('express');
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', process.env.TRUST_PROXY === '1');

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-ancestors 'none'"
  );
  next();
});
app.use(express.json({ limit: '2mb' }));

// Setiap file di /api (kecuali yang diawali "_" dan db.js) menjadi route /api/<nama>
const apiDir = path.join(__dirname, 'api');
function mount(dir, prefix) {
  for (const f of fs.readdirSync(dir)) {
    if (f.startsWith('_') || f === 'db.js') continue;
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) {
      mount(full, `${prefix}/${f}`);
    } else if (f.endsWith('.js')) {
      const handler = require(full);
      if (typeof handler === 'function') {
        app.all(`${prefix}/${f.replace(/\.js$/, '')}`, (req, res, next) =>
          Promise.resolve(handler(req, res)).catch(next));
      }
    }
  }
}
mount(apiDir, '/api');
app.use('/api', (req, res) => res.status(404).json({ success: false, error: 'Endpoint tidak ditemukan.' }));

// Frontend statis: hanya folder public/.
// index.html disajikan dinamis: %V% diganti versi (waktu ubah terbaru file css/js) agar CDN/Cloudflare
// dan browser tidak menyajikan CSS/JS lama setelah update. HTML-nya sendiri tidak di-cache.
const publicDir = path.join(__dirname, 'public');
function versiAset() {
  let t = 0;
  for (const dir of ['css', 'js']) {
    for (const f of fs.readdirSync(path.join(publicDir, dir))) {
      t = Math.max(t, fs.statSync(path.join(publicDir, dir, f)).mtimeMs);
    }
  }
  return Math.floor(t / 1000).toString(36);
}
function kirimIndex(req, res) {
  const html = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8').replace(/%V%/g, versiAset());
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, must-revalidate');
  res.send(html);
}
app.get(['/', '/index.html'], kirimIndex);
app.use(express.static(publicDir, { dotfiles: 'ignore', index: false, maxAge: '1h' }));

app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, error: 'Format JSON tidak valid.' });
  }
  console.error('[server]', err);
  if (res.headersSent) return next(err);
  res.status(500).json({ success: false, error: 'Terjadi kesalahan pada server.' });
});

const port = parseInt(process.env.PORT || '3000', 10);
// Bawaan hanya menerima koneksi dari komputer ini (aman di belakang Apache/Nginx).
const host = process.env.HOST || '127.0.0.1';
app.listen(port, host, () => console.log(`E-Kas RW 03 berjalan di http://${host}:${port}`));
