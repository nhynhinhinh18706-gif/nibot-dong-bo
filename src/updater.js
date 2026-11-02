// Tự cập nhật từ GitHub Releases (cấu hình "publish" trong package.json).
// - Windows bản cài (Setup): tự tải bản mới, bấm "Khởi động lại để cập nhật".
// - Windows Portable và macOS (chưa ký số): chỉ báo có bản mới và mở trang tải về.
const { app, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const { log } = require('./logger');

const CHECK_EVERY = 4 * 60 * 60 * 1000;

function canSelfInstall() {
  return process.platform === 'win32' && !process.env.PORTABLE_EXECUTABLE_FILE;
}

function releasesUrl() {
  const pub = require('../package.json').build?.publish;
  const gh = Array.isArray(pub) ? pub.find((p) => p.provider === 'github') : pub;
  return gh ? `https://github.com/${gh.owner}/${gh.repo}/releases/latest` : null;
}

function initUpdater(send) {
  const state = { status: 'idle', version: null, error: null };
  const update = (patch) => { Object.assign(state, patch); send(state); };

  autoUpdater.autoDownload = canSelfInstall();
  autoUpdater.autoInstallOnAppQuit = canSelfInstall();
  autoUpdater.logger = { info: (m) => log('INFO', '[update] ' + m), warn: (m) => log('WARN', '[update] ' + m), error: (m) => log('ERROR', '[update] ' + m), debug: () => {} };

  autoUpdater.on('checking-for-update', () => update({ status: 'checking', error: null }));
  autoUpdater.on('update-not-available', () => update({ status: 'latest' }));
  autoUpdater.on('update-available', (i) => update({ status: canSelfInstall() ? 'downloading' : 'available', version: i.version }));
  autoUpdater.on('download-progress', (p) => update({ status: 'downloading', percent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', (i) => update({ status: 'ready', version: i.version }));
  autoUpdater.on('error', (e) => { log('ERROR', '[update] ' + (e?.stack || e)); update({ status: 'error', error: String(e?.message || e).split('\n')[0] }); });

  const check = async () => {
    if (!app.isPackaged) { update({ status: 'dev' }); return state; }
    try { await autoUpdater.checkForUpdates(); } catch (e) { /* đã báo qua sự kiện 'error' */ }
    return state;
  };

  setTimeout(check, 8000);
  setInterval(check, CHECK_EVERY);

  return {
    check,
    state: () => ({ ...state, current: app.getVersion(), selfInstall: canSelfInstall() }),
    install: () => {
      if (state.status === 'ready') { autoUpdater.quitAndInstall(false, true); return true; }
      const url = releasesUrl();
      if (url) shell.openExternal(url);
      return false;
    },
  };
}

module.exports = { initUpdater, releasesUrl };
