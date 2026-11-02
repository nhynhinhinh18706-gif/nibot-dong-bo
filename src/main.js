const { app, BrowserWindow, ipcMain, safeStorage, shell, dialog } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { initLogger, log, tail, logFile } = require('./logger');
const { Nibot } = require('./nibot');
const { runBatch } = require('./runner');
const { currentPeriod } = require('./periods');
const { findBrowsers } = require('./browsers');
const { initUpdater } = require('./updater');

let win;
let nibot = null; // phiên trình duyệt đang mở
let running = false;
let updater = null;

const userDir = () => app.getPath('userData');
const settingsFile = () => path.join(userDir(), 'settings.json');
const runsDir = () => path.join(userDir(), 'runs');

// ---------- Lỗi không bắt được: ghi file + báo người dùng thay vì tắt im lặng ----------

process.on('uncaughtException', (e) => {
  log('ERROR', e);
  try { dialog.showErrorBox('Nibot Đồng Bộ gặp lỗi', `${e.message}\n\nBấm "Xuất nhật ký lỗi" trong app và gửi file cho người hỗ trợ.`); } catch {}
});
process.on('unhandledRejection', (e) => log('ERROR', e instanceof Error ? e : new Error(String(e))));

// ---------- Cài đặt (mật khẩu được mã hóa bằng safeStorage của hệ điều hành) ----------

function readSettingsFile() {
  try { return JSON.parse(fs.readFileSync(settingsFile(), 'utf8')); } catch { return {}; }
}

function loadSettings() {
  const s = readSettingsFile();
  let password = '';
  if (s.passwordEnc && safeStorage.isEncryptionAvailable()) {
    try { password = safeStorage.decryptString(Buffer.from(s.passwordEnc, 'base64')); } catch (e) { log('WARN', 'Không giải mã được mật khẩu đã lưu (đổi máy/tài khoản Windows?) — cần nhập lại.'); }
  }
  return { guid: s.guid || '', username: s.username || '', password, headless: !!s.headless, browserPath: s.browserPath || '' };
}

function saveSettings(s) {
  const old = readSettingsFile();
  const out = { guid: s.guid, username: s.username, headless: !!s.headless, browserPath: (s.browserPath || '').trim(), passwordEnc: old.passwordEnc };
  if (s.password) {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Máy không hỗ trợ mã hóa mật khẩu');
    out.passwordEnc = safeStorage.encryptString(s.password).toString('base64');
  }
  fs.mkdirSync(userDir(), { recursive: true });
  fs.writeFileSync(settingsFile(), JSON.stringify(out, null, 1), 'utf8');
  log('INFO', 'Đã lưu cài đặt');
}

// ---------- Trình duyệt ----------

const send = (type, data) => { if (win && !win.isDestroyed()) win.webContents.send('event', { type, data }); };
const emit = (type, data) => {
  if (type === 'log') log('INFO', data);
  if (type === 'task') log(data.state === 'loi' ? 'ERROR' : 'INFO', `[${data.mst}] ${data.task}: ${data.state}${data.evidence ? ' — ' + data.evidence : ''}`);
  send(type, data);
};

async function ensureNibot() {
  if (nibot) return nibot;
  const s = loadSettings();
  const n = new Nibot({ profileDir: path.join(userDir(), 'browser-profile'), headless: s.headless, browserPath: s.browserPath, log: (m) => emit('log', m) });
  await n.open();
  n.ctx.on('close', () => { if (nibot === n) nibot = null; });
  try { await n.login(s); } catch (e) { await n.close(); throw e; }
  nibot = n;
  return n;
}

// ---------- Chẩn đoán ----------

function systemInfo() {
  const s = loadSettings();
  const browsers = findBrowsers(s.browserPath);
  return [
    `App: ${app.getVersion()} ${app.isPackaged ? '(bản cài)' : '(dev)'}${process.env.PORTABLE_EXECUTABLE_FILE ? ' Portable' : ''}`,
    `Hệ điều hành: ${os.type()} ${os.release()} ${os.arch()} — ${process.getSystemVersion?.() || ''}`,
    `Electron ${process.versions.electron}, Chrome ${process.versions.chrome}, Node ${process.versions.node}`,
    `RAM: ${Math.round(os.totalmem() / 1073741824)} GB, CPU: ${os.cpus()[0]?.model || '?'} x${os.cpus().length}`,
    `Thư mục dữ liệu: ${userDir()}`,
    `Trình duyệt tìm thấy: ${browsers.length ? browsers.map((b) => `${b.name} (${b.path})`).join('; ') : 'KHÔNG CÓ'}`,
    `Cài đặt: GUID ${s.guid ? 'có' : 'THIẾU'}, Username ${s.username ? 'có' : 'THIẾU'}, Mật khẩu ${s.password ? 'có' : 'THIẾU'}, chạy ẩn ${s.headless ? 'bật' : 'tắt'}`,
    `Mã hóa mật khẩu: ${safeStorage.isEncryptionAvailable() ? 'có' : 'KHÔNG'}`,
  ];
}

async function runDiagnostics() {
  const out = systemInfo();
  // Mạng tới Nibot
  try {
    const t0 = Date.now();
    const r = await fetch('https://portal.nangdong.online/', { signal: AbortSignal.timeout(20000) });
    out.push(`Kết nối portal.nangdong.online: HTTP ${r.status} (${Date.now() - t0} ms)`);
  } catch (e) {
    out.push(`Kết nối portal.nangdong.online: LỖI — ${e.message} (kiểm tra mạng, tường lửa, proxy)`);
  }
  // Mở thử trình duyệt bằng hồ sơ tạm
  if (!nibot) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nibot-diag-'));
    const n = new Nibot({ profileDir: tmp, headless: true, browserPath: loadSettings().browserPath, log: (m) => out.push(m) });
    try {
      await n.open();
      await n.page.goto('https://portal.nangdong.online/', { waitUntil: 'domcontentloaded' });
      out.push(`Mở trang đăng nhập Nibot bằng trình duyệt: ${(await n.page.locator('#btnLogin').count()) ? 'OK' : 'không thấy nút Đăng nhập'}`);
    } catch (e) {
      out.push('Mở trình duyệt: LỖI — ' + e.message);
    } finally {
      await n.close();
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  } else {
    out.push('Trình duyệt: đang mở và đã đăng nhập');
  }
  out.forEach((l) => log('INFO', '[diag] ' + l));
  return out;
}

async function exportLogs() {
  const diag = await runDiagnostics();
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const dest = path.join(app.getPath('downloads'), `Nibot-nhat-ky-loi-${stamp}.txt`);
  const runs = (() => { try { return fs.readdirSync(runsDir()).filter((f) => f.endsWith('.md')).sort().slice(-3); } catch { return []; } })();
  const parts = [
    '=== KIỂM TRA MÁY ===', ...diag, '',
    '=== NHẬT KÝ (gần nhất) ===', tail(600), '',
    ...runs.flatMap((f) => [`=== BÁO CÁO ${f} ===`, fs.readFileSync(path.join(runsDir(), f), 'utf8'), '']),
  ];
  fs.writeFileSync(dest, parts.join('\n'), 'utf8');
  shell.showItemInFolder(dest);
  return dest;
}

// ---------- IPC (mọi lỗi đều được ghi vào nhật ký) ----------

const handle = (name, fn) => ipcMain.handle(name, async (...args) => {
  try { return await fn(...args); } catch (e) { log('ERROR', `${name}: ${e.stack || e}`); throw e; }
});

handle('settings:get', () => { const s = loadSettings(); return { ...s, password: '', hasPassword: !!s.password }; });
handle('settings:save', (_e, s) => { saveSettings(s); return true; });
handle('period:current', (_e, kind) => currentPeriod(kind));

handle('companies:load', async () => {
  const n = await ensureNibot();
  const list = await n.listCompanies();
  emit('log', `Tải được ${list.length} doanh nghiệp.`);
  return list;
});

handle('run:start', async (_e, { companies, period }) => {
  if (running) throw new Error('Đang có một đợt chạy');
  if (!companies?.length) throw new Error('Chưa chọn doanh nghiệp');
  running = true;
  try {
    const n = await ensureNibot();
    n.stopped = false;
    const r = await runBatch({ nibot: n, companies, period, runsDir: runsDir(), emit });
    emit('log', 'Báo cáo: ' + r.reportFile);
    return { reportFile: r.reportFile, progressFile: r.progressFile, run: r.run };
  } finally {
    running = false;
  }
});

handle('run:stop', () => { nibot?.stop(); emit('log', 'Đang dừng sau bước hiện tại…'); return true; });
handle('open:path', (_e, p) => shell.openPath(p || runsDir()));
handle('diag:run', () => runDiagnostics());
handle('logs:export', () => exportLogs());
handle('log:renderer', (_e, m) => { log('ERROR', '[giao diện] ' + m); return true; });
handle('app:version', () => app.getVersion());
handle('update:check', () => updater.check().then(() => updater.state()));
handle('update:state', () => updater.state());
handle('update:install', () => {
  if (running) throw new Error('Đang đồng bộ — chờ xong rồi cập nhật');
  return updater.install();
});

// ---------- Cửa sổ ----------

app.whenReady().then(() => {
  initLogger(path.join(userDir(), 'logs'));
  log('INFO', '==== Khởi động ' + systemInfo().join(' | '));
  win = new BrowserWindow({
    width: 1100, height: 760, minWidth: 820, minHeight: 600,
    title: 'Nibot Đồng Bộ',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  win.setMenuBarVisibility(false);
  win.webContents.on('render-process-gone', (_e, d) => log('ERROR', 'Giao diện bị dừng: ' + JSON.stringify(d)));
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  updater = initUpdater((st) => send('update', { ...st, current: app.getVersion() }));
});

app.on('window-all-closed', async () => { await nibot?.close(); app.quit(); });
