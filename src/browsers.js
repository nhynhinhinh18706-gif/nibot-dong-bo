// Tìm Chrome / Edge đã cài trên máy (Windows, macOS, Linux).
const fs = require('fs');
const os = require('os');
const path = require('path');

function candidates() {
  if (process.platform === 'win32') {
    const roots = [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean);
    return [
      ...roots.map((r) => ({ name: 'Google Chrome', path: path.join(r, 'Google', 'Chrome', 'Application', 'chrome.exe') })),
      ...roots.map((r) => ({ name: 'Microsoft Edge', path: path.join(r, 'Microsoft', 'Edge', 'Application', 'msedge.exe') })),
    ];
  }
  if (process.platform === 'darwin') {
    const apps = ['/Applications', path.join(os.homedir(), 'Applications')];
    return [
      ...apps.map((a) => ({ name: 'Google Chrome', path: path.join(a, 'Google Chrome.app', 'Contents', 'MacOS', 'Google Chrome') })),
      ...apps.map((a) => ({ name: 'Microsoft Edge', path: path.join(a, 'Microsoft Edge.app', 'Contents', 'MacOS', 'Microsoft Edge') })),
    ];
  }
  return ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/microsoft-edge', '/usr/bin/chromium']
    .map((p) => ({ name: path.basename(p), path: p }));
}

// Trả về danh sách trình duyệt tìm thấy; customPath (nếu có) được ưu tiên.
function findBrowsers(customPath) {
  const list = [];
  if (customPath) list.push({ name: 'Đường dẫn tự chọn', path: customPath });
  list.push(...candidates());
  const seen = new Set();
  return list.filter((b) => {
    const key = b.path.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    try { return fs.statSync(b.path).isFile(); } catch { return false; }
  });
}

module.exports = { findBrowsers, candidates };
