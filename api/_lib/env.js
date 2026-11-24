// Muat file .env sederhana (tanpa dependensi). Variabel yang sudah ada di environment tidak ditimpa.
const fs = require('fs');
const path = require('path');

function loadEnv(file = path.join(__dirname, '..', '..', '.env')) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (_) { return; }
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  }
}

module.exports = { loadEnv };
