// Ghi nhật ký ra file để chẩn đoán lỗi trên máy khác. Không ghi mật khẩu.
const fs = require('fs');
const path = require('path');

const MAX_BYTES = 2 * 1024 * 1024;
let file = null;

function initLogger(dir) {
  fs.mkdirSync(dir, { recursive: true });
  file = path.join(dir, 'app.log');
  try {
    if (fs.statSync(file).size > MAX_BYTES) fs.renameSync(file, path.join(dir, 'app.old.log'));
  } catch {}
  return file;
}

function log(level, msg) {
  const text = msg instanceof Error ? `${msg.message}\n${msg.stack || ''}` : String(msg);
  const line = `${new Date().toISOString()} [${level}] ${text}\n`;
  if (file) { try { fs.appendFileSync(file, line, 'utf8'); } catch {} }
  if (level === 'ERROR') console.error(line.trim()); else console.log(line.trim());
}

function tail(maxLines = 600) {
  if (!file) return '';
  try { return fs.readFileSync(file, 'utf8').split('\n').slice(-maxLines).join('\n'); } catch { return ''; }
}

module.exports = { initLogger, log, tail, logFile: () => file };
