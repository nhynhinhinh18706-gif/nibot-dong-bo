const $ = (s) => document.querySelector(s);
const LABEL = { hoan_tat: 'Hoàn tất', loi: 'Lỗi', chua_chay: 'Chưa chạy', dang_chay: 'Đang chạy', chua_xac_minh: 'Chưa xác minh' };
const TASKS = ['hoa_don', 'hang_hoa', 'dtpn_vao', 'dtpn_ra'];

const state = { companies: [], selected: new Set(), period: null /* { kind: 'quy'|'thang', n, year } */, running: false, lastReport: null };

const pad = (n) => String(n).padStart(2, '0');
const periodLabel = (p) => `${p.kind === 'thang' ? 'Tháng' : 'Quý'} ${p.n}/${p.year}`;
// Khoảng ngày hóa đơn của kỳ, dạng dd/mm/yyyy
function periodRange(p) {
  const startM = p.kind === 'quy' ? (p.n - 1) * 3 + 1 : p.n;
  const endM = p.kind === 'quy' ? startM + 2 : p.n;
  const last = new Date(p.year, endM, 0).getDate();
  return [`01/${pad(startM)}/${p.year}`, `${pad(last)}/${pad(endM)}/${p.year}`];
}

const log = (m) => {
  const el = $('#log');
  el.textContent += `[${new Date().toLocaleTimeString('vi-VN')}] ${m}\n`;
  el.scrollTop = el.scrollHeight;
};

function refreshControls() {
  const n = state.selected.size;
  $('#companiesText').textContent = n === 0 ? 'Chọn doanh nghiệp…'
    : n === state.companies.length ? `Tất cả (${n} doanh nghiệp)`
    : n === 1 ? state.companies.find((c) => state.selected.has(c.mst)).name
    : `${n} doanh nghiệp`;
  $('#quarterText').textContent = state.period ? periodLabel(state.period) : 'Chọn kỳ…';
  $('#btnStart').disabled = state.running || !n || !state.period;
  $('#btnStart').hidden = state.running;
  $('#btnStop').hidden = !state.running;
  $('#btnCompanies').disabled = state.running;
  $('#btnQuarter').disabled = state.running;
  $('#btnSettings').disabled = state.running;
  if (state.period) {
    const [from, to] = periodRange(state.period);
    const y = state.period.year;
    $('#periodHint').textContent = `Hóa đơn: ${from} – ${to}. Hàng hóa & ĐTPN: 01/01/${y} – ${y === new Date().getFullYear() ? 'hôm nay' : '31/12/' + y}.`;
  }
}

// ---------- Doanh nghiệp ----------

function renderCompanyList() {
  const q = $('#companySearch').value.trim().toLowerCase();
  const box = $('#companyList');
  box.innerHTML = '';
  if (!state.companies.length) { box.innerHTML = '<p class="muted">Bấm “Tải lại” để đăng nhập Nibot và lấy danh sách.</p>'; return; }
  for (const c of state.companies) {
    if (q && !c.name.toLowerCase().includes(q) && !c.mst.includes(q)) continue;
    const lab = document.createElement('label');
    lab.className = 'check';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = state.selected.has(c.mst);
    cb.onchange = () => { cb.checked ? state.selected.add(c.mst) : state.selected.delete(c.mst); syncAll(); };
    const name = document.createElement('span'); name.textContent = `${c.stt}. ${c.name}`;
    const mst = document.createElement('span'); mst.className = 'mst'; mst.textContent = c.mst;
    lab.append(cb, name, mst);
    box.append(lab);
  }
  syncAll();
}

function syncAll() {
  $('#chkAll').checked = state.companies.length > 0 && state.selected.size === state.companies.length;
  $('#companyCount').textContent = state.companies.length ? `Đã chọn ${state.selected.size}/${state.companies.length}` : '';
}

async function reloadCompanies() {
  const btn = $('#btnReload');
  btn.disabled = true; btn.textContent = 'Đang tải…';
  try {
    state.companies = await window.api.loadCompanies();
    const valid = new Set(state.companies.map((c) => c.mst));
    for (const m of [...state.selected]) if (!valid.has(m)) state.selected.delete(m);
    renderCompanyList();
  } catch (e) {
    log('Lỗi tải doanh nghiệp: ' + e.message);
    $('#companyList').innerHTML = `<p class="muted">${e.message.replace(/</g, '&lt;')}</p>`;
  } finally { btn.disabled = false; btn.textContent = '↻ Tải lại'; }
}

$('#btnCompanies').onclick = () => {
  $('#dlgCompanies').showModal();
  renderCompanyList();
  if (!state.companies.length) reloadCompanies();
};
$('#btnReload').onclick = reloadCompanies;
$('#companySearch').oninput = renderCompanyList;
$('#chkAll').onchange = (e) => {
  state.selected = e.target.checked ? new Set(state.companies.map((c) => c.mst)) : new Set();
  renderCompanyList();
};
$('#dlgCompanies').addEventListener('close', refreshControls);

// ---------- Kỳ: quý hoặc tháng ----------

const pick = { kind: 'quy', n: null }; // lựa chọn tạm trong hộp thoại

function renderPicker() {
  document.querySelectorAll('.seg button').forEach((b) => b.classList.toggle('on', b.dataset.kind === pick.kind));
  document.querySelectorAll('.quarters').forEach((g) => {
    g.hidden = g.dataset.for !== pick.kind;
    g.querySelectorAll('button').forEach((b) => b.classList.toggle('on', g.dataset.for === pick.kind && Number(b.dataset.n) === pick.n));
  });
}

$('#btnQuarter').onclick = () => {
  Object.assign(pick, { kind: state.period.kind, n: state.period.n });
  $('#yearInput').value = state.period.year;
  $('#yearInput').max = new Date().getFullYear();
  renderPicker();
  $('#dlgQuarter').showModal();
};
document.querySelectorAll('.seg button').forEach((b) => b.onclick = async () => {
  if (pick.kind === b.dataset.kind) return;
  pick.kind = b.dataset.kind;
  // Đổi loại kỳ: gợi ý luôn tháng/quý hiện tại
  const cur = await window.api.currentPeriod(pick.kind);
  pick.n = Number($('#yearInput').value) === cur.year ? cur.n : null;
  renderPicker();
});
document.querySelectorAll('.quarters button').forEach((b) => b.onclick = () => {
  pick.n = Number(b.dataset.n);
  renderPicker();
});
$('#btnQuarterOk').onclick = (e) => {
  const y = Number($('#yearInput').value);
  if (!pick.n || !y || y > new Date().getFullYear()) { e.preventDefault(); return; }
  state.period = { kind: pick.kind, n: pick.n, year: y };
  refreshControls();
};

// ---------- Cài đặt ----------

$('#btnSettings').onclick = async () => {
  const s = await window.api.getSettings();
  $('#sGuid').value = s.guid; $('#sUser').value = s.username; $('#sPass').value = '';
  $('#sPass').placeholder = s.hasPassword ? '(đã lưu — để trống nếu không đổi)' : 'nhập mật khẩu';
  $('#sHeadless').checked = s.headless;
  $('#sBrowser').value = s.browserPath || '';
  $('#dlgSettings').showModal();
};
$('#btnSettingsSave').onclick = async () => {
  try {
    await window.api.saveSettings({ guid: $('#sGuid').value.trim(), username: $('#sUser').value.trim(), password: $('#sPass').value, headless: $('#sHeadless').checked, browserPath: $('#sBrowser').value.trim() });
    log('Đã lưu cài đặt.');
  } catch (e) { log('Lỗi lưu cài đặt: ' + e.message); }
};

// ---------- Chẩn đoán & nhật ký lỗi ----------

window.addEventListener('error', (e) => window.api.logError(`${e.message} @ ${e.filename}:${e.lineno}`));
window.addEventListener('unhandledrejection', (e) => window.api.logError(String(e.reason?.stack || e.reason)));

$('#btnDiag').onclick = async () => {
  const b = $('#btnDiag');
  b.disabled = true; log('Đang kiểm tra máy…');
  try { (await window.api.diagnose()).forEach((l) => log('  ' + l)); }
  catch (e) { log('Lỗi kiểm tra: ' + e.message); }
  finally { b.disabled = false; }
};
$('#btnExportLogs').onclick = async () => {
  const b = $('#btnExportLogs');
  b.disabled = true; log('Đang xuất nhật ký lỗi (kèm kiểm tra máy)…');
  try { log('Đã lưu: ' + (await window.api.exportLogs()) + ' — gửi file này cho người hỗ trợ.'); }
  catch (e) { log('Lỗi xuất nhật ký: ' + e.message); }
  finally { b.disabled = false; }
};

// ---------- Cập nhật ----------

function renderUpdate(u) {
  const bar = $('#updateBar'), btn = $('#btnUpdateAction');
  const show = (text, action, err) => {
    bar.hidden = !text; bar.classList.toggle('err', !!err);
    $('#updateText').textContent = text || '';
    btn.hidden = !action; btn.textContent = action || '';
  };
  switch (u.status) {
    case 'downloading': return show(`Đang tải bản mới ${u.version || ''}${u.percent != null ? ` (${u.percent}%)` : ''}…`);
    case 'ready': return show(`Bản mới ${u.version} đã sẵn sàng.`, 'Khởi động lại để cập nhật');
    case 'available': return show(`Có bản mới ${u.version} (đang dùng ${u.current}).`, 'Mở trang tải về');
    case 'error': return manualCheck ? show('Không kiểm tra được cập nhật: ' + u.error, null, true) : show('');
    case 'latest': return manualCheck ? show(`Đang dùng bản mới nhất (${u.current}).`) : show('');
    case 'dev': return manualCheck ? show('Bản chạy thử từ mã nguồn — không tự cập nhật.') : show('');
    default: return show('');
  }
}
let manualCheck = false;
window.api.onEvent(({ type, data }) => { if (type === 'update') renderUpdate(data); });
$('#btnUpdate').onclick = async () => {
  manualCheck = true;
  renderUpdate({ status: 'downloading', version: '' });
  $('#updateText').textContent = 'Đang kiểm tra bản mới…';
  try { renderUpdate(await window.api.checkUpdate()); } catch (e) { renderUpdate({ status: 'error', error: e.message }); }
};
$('#btnUpdateAction').onclick = async () => {
  try { await window.api.installUpdate(); } catch (e) { log(e.message); }
};

// ---------- Chạy ----------

function renderTable(companies) {
  const tb = $('#results tbody');
  tb.innerHTML = '';
  for (const c of companies) {
    const tr = document.createElement('tr');
    tr.id = 'row-' + c.mst;
    tr.innerHTML = `<td></td><td></td>${TASKS.map((t, i) => (i === 1 ? '<td class="mb"></td>' : '') + `<td data-task="${t}"><span class="st chua_chay">Chưa chạy</span></td>`).join('')}`;
    tr.children[0].textContent = c.name;
    tr.children[1].textContent = c.mst;
    tb.append(tr);
  }
}

window.api.onEvent(({ type, data }) => {
  if (type === 'log') log(data);
  if (type === 'task') {
    const cell = document.querySelector(`#row-${data.mst} [data-task="${data.task}"]`);
    if (cell) {
      cell.innerHTML = `<span class="st ${data.state}">${LABEL[data.state]}</span>`;
      cell.title = data.evidence || '';
    }
    if (data.task === 'hoa_don' && data.state === 'hoan_tat') {
      const mb = document.querySelector(`#row-${data.mst} .mb`);
      if (mb) mb.textContent = `${data.buy ?? '?'} / ${data.sell ?? '?'}`;
    }
  }
});

$('#btnStart').onclick = async () => {
  const companies = state.companies.filter((c) => state.selected.has(c.mst));
  if (!confirm(`Đồng bộ ${periodLabel(state.period)} cho ${companies.length} doanh nghiệp?`)) return;
  state.running = true; refreshControls();
  renderTable(companies);
  try {
    const r = await window.api.start(companies, state.period);
    state.lastReport = r.reportFile;
    log('Hoàn tất đợt chạy.');
  } catch (e) {
    log('Lỗi: ' + e.message);
  } finally {
    state.running = false; refreshControls();
  }
};
$('#btnStop').onclick = () => window.api.stop();
$('#btnOpenRuns').onclick = () => window.api.openPath(null);

// ---------- Khởi động ----------

(async () => {
  $('#appVersion').textContent = 'v' + (await window.api.version());
  state.period = await window.api.currentPeriod('quy');
  refreshControls();
  const s = await window.api.getSettings();
  if (!s.guid || !s.username || !s.hasPassword) log('Chưa có thông tin đăng nhập Nibot — mở ⚙ Cài đặt để nhập.');
})();
