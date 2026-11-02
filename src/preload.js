const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (s) => ipcRenderer.invoke('settings:save', s),
  currentPeriod: (kind) => ipcRenderer.invoke('period:current', kind),
  loadCompanies: () => ipcRenderer.invoke('companies:load'),
  start: (companies, period) => ipcRenderer.invoke('run:start', { companies, period }),
  stop: () => ipcRenderer.invoke('run:stop'),
  openPath: (p) => ipcRenderer.invoke('open:path', p),
  diagnose: () => ipcRenderer.invoke('diag:run'),
  exportLogs: () => ipcRenderer.invoke('logs:export'),
  logError: (m) => ipcRenderer.invoke('log:renderer', m),
  version: () => ipcRenderer.invoke('app:version'),
  checkUpdate: () => ipcRenderer.invoke('update:check'),
  updateState: () => ipcRenderer.invoke('update:state'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onEvent: (cb) => ipcRenderer.on('event', (_e, ev) => cb(ev)),
});
