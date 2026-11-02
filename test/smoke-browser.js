// Kiểm tra nhanh: Playwright mở được Chrome và nhận diện form đăng nhập Nibot (không đăng nhập).
// Chạy: node test/smoke-browser.js
const os = require('os');
const path = require('path');
const fs = require('fs');
const { Nibot } = require('../src/nibot');

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nibot-smoke-'));
  const n = new Nibot({ profileDir: dir, headless: true, log: console.log });
  await n.open();
  await n.page.goto('https://portal.nangdong.online/', { waitUntil: 'domcontentloaded' });
  const ids = ['#chkUserCon', '#txtGuid', '#txtUsername', '#txtPassword', '#chkGhiNho', '#btnLogin'];
  const found = await Promise.all(ids.map((s) => n.page.locator(s).count()));
  ids.forEach((s, i) => console.log(found[i] ? '✓' : '✗', s));
  await n.close();
  fs.rmSync(dir, { recursive: true, force: true });
  process.exit(found.every(Boolean) ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
