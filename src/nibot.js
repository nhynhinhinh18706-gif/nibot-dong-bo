// Điều khiển Nibot bằng Playwright (Chrome/Edge cài sẵn trên máy).
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');
const { findBrowsers, candidates } = require('./browsers');

const PORTAL = 'https://portal.nangdong.online/';
const TASK_TIMEOUT = 10 * 60 * 1000; // 10 phút cho mỗi tác vụ, theo quy trình
const STEP_TIMEOUT = 60 * 1000; // máy chậm / mạng chậm vẫn đủ thời gian tải trang

class StopError extends Error {}

class Nibot {
  constructor({ profileDir, headless = false, browserPath = '', log = () => {} }) {
    this.profileDir = profileDir;
    this.headless = headless;
    this.browserPath = browserPath;
    this.log = log;
    this.stopped = false;
    this.base = null; // máy chủ thực tế sau khi đăng nhập, ví dụ https://nibot2.com:7878
  }

  stop() { this.stopped = true; }
  checkStop() { if (this.stopped) throw new StopError('Đã dừng theo yêu cầu'); }

  async open() {
    const browsers = findBrowsers(this.browserPath);
    if (!browsers.length) {
      throw new Error('Không tìm thấy Google Chrome hoặc Microsoft Edge trên máy. Hãy cài Chrome (google.com/chrome) '
        + 'hoặc nhập đường dẫn chrome.exe trong Cài đặt. Đã tìm ở:\n' + candidates().map((c) => '  ' + c.path).join('\n'));
    }
    fs.mkdirSync(this.profileDir, { recursive: true });
    const opts = { headless: this.headless, viewport: { width: 1280, height: 860 }, timeout: STEP_TIMEOUT };
    const errors = [];
    for (const b of browsers) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          this.ctx = await chromium.launchPersistentContext(this.profileDir, { ...opts, executablePath: b.path });
          this.log(`Mở trình duyệt: ${b.name} (${b.path})`);
          this.page = this.ctx.pages()[0] || (await this.ctx.newPage());
          this.page.setDefaultTimeout(STEP_TIMEOUT);
          this.page.setDefaultNavigationTimeout(STEP_TIMEOUT);
          return;
        } catch (e) {
          errors.push(`${b.name}: ${e.message.split('\n')[0]}`);
          // Hồ sơ bị khóa do lần trước tắt đột ngột: xóa khóa rồi thử lại một lần.
          if (attempt === 0 && /lock|already in use|ProcessSingleton/i.test(e.message)) {
            for (const f of ['SingletonLock', 'SingletonCookie', 'SingletonSocket', 'lockfile']) {
              try { fs.rmSync(path.join(this.profileDir, f), { force: true }); } catch {}
            }
            continue;
          }
          break;
        }
      }
    }
    throw new Error('Không mở được trình duyệt. Hãy đóng mọi cửa sổ Chrome do app mở rồi thử lại.\n' + errors.join('\n'));
  }

  async close() { try { await this.ctx?.close(); } catch {} }

  // ---------- Đăng nhập & danh sách doanh nghiệp ----------

  async login({ guid, username, password }) {
    const p = this.page;
    await p.goto(PORTAL, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(1500);
    if (!p.url().startsWith(PORTAL) || !(await p.locator('#btnLogin').isVisible().catch(() => false))) {
      // Đã có phiên đăng nhập còn hiệu lực
      if (await this.hasCompanyList()) { this.base = new URL(p.url()).origin; this.log('Dùng phiên đăng nhập đã lưu.'); return; }
    }
    if (!guid || !username || !password) throw new Error('Chưa nhập đủ GUID / Username / Mật khẩu trong Cài đặt.');
    this.log('Đang đăng nhập Nibot…');
    if (!(await p.locator('#chkUserCon').isChecked())) await p.locator('#chkUserCon').check();
    await p.locator('#txtGuid').fill(guid);
    await p.locator('#txtUsername').fill(username);
    await p.locator('#txtPassword').fill(password);
    if (!(await p.locator('#chkGhiNho').isChecked())) await p.locator('#chkGhiNho').check();
    await p.locator('#btnLogin').click();
    try {
      await p.waitForFunction(() => document.querySelectorAll('a[href*="QLHD/"]').length > 0, null, { timeout: 90000 });
    } catch {
      const msg = await p.evaluate(() => (document.querySelector('.swal2-html-container, .toast, .alert, .dx-dialog .dx-overlay-content')?.innerText || '').trim());
      throw new Error('Đăng nhập không thành công' + (msg ? ': ' + msg : '. Kiểm tra lại thông tin hoặc OTP/CAPTCHA trên cửa sổ Chrome.'));
    }
    this.base = new URL(p.url()).origin;
    this.log('Đăng nhập thành công: ' + this.base);
  }

  async hasCompanyList() {
    return this.page.evaluate(() => document.querySelectorAll('a[href*="QLHD/"]').length > 0).catch(() => false);
  }

  async listCompanies() {
    const p = this.page;
    if (!(await this.hasCompanyList())) {
      await p.goto(this.base + '/', { waitUntil: 'domcontentloaded' });
      await p.waitForFunction(() => document.querySelectorAll('a[href*="QLHD/"]').length > 0, null, { timeout: STEP_TIMEOUT });
    }
    const rows = await p.evaluate(() => [...document.querySelectorAll('a[href*="QLHD/"]')].map((a) => ({ text: a.innerText.trim(), href: a.getAttribute('href') })));
    const seen = new Set();
    const list = [];
    for (const r of rows) {
      const m = r.href.match(/QLHD\/([^/]+)\/([^/?#]+)/);
      const t = r.text.match(/^(\d+)\.\s*(.*?)\s*\(([\d-]+)\)\s*$/s);
      if (!m || !t || seen.has(m[1])) continue;
      seen.add(m[1]);
      list.push({ stt: t[1], name: t[2], mst: m[1], guid: m[2] });
    }
    return list;
  }

  // ---------- Tiện ích ----------

  // Nội dung hộp thoại DevExtreme đang hiển thị (xác nhận / thông báo).
  async dialogText() {
    return this.page.evaluate(() => [...document.querySelectorAll('.dx-dialog .dx-overlay-content')]
      .filter((e) => e.offsetParent).map((e) => e.innerText.trim()).join(' | '));
  }

  async waitDialog(pred, timeout = TASK_TIMEOUT) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      this.checkStop();
      const t = await this.dialogText();
      if (t && pred(t)) return t;
      await this.page.waitForTimeout(1000);
    }
    return null;
  }

  async clickDialogButton(label) {
    await this.page.locator('.dx-dialog .dx-overlay-content .dx-button', { hasText: new RegExp(`^\\s*${label}\\s*$`) }).first().click();
  }

  async setDates(scopeSel, fromId, toId, from, to) {
    return this.page.evaluate(({ scopeSel, fromId, toId, from, to }) => {
      const box = (id) => jQuery(`${scopeSel} #${id}`).dxDateBox('instance');
      box(fromId).option('value', new Date(from.y, from.m - 1, from.d));
      box(toId).option('value', new Date(to.y, to.m - 1, to.d));
      const txt = (id) => jQuery(`${scopeSel} #${id} input.dx-texteditor-input`).val();
      return { from: txt(fromId), to: txt(toId) };
    }, { scopeSel, fromId, toId, from, to });
  }

  async setChecked(map) {
    await this.page.evaluate((map) => {
      for (const [id, val] of Object.entries(map)) {
        const el = document.getElementById(id);
        if (!el) throw new Error('Không thấy ô #' + id);
        if (el.checked !== val) el.click();
      }
    }, map);
    const actual = await this.page.evaluate((ids) => Object.fromEntries(ids.map((id) => [id, document.getElementById(id).checked])), Object.keys(map));
    for (const [id, val] of Object.entries(map)) if (actual[id] !== val) throw new Error(`Không đặt được #${id}`);
  }

  // MST nằm trong URL và trong chữ trang (breadcrumb) hoặc trong ô chọn doanh nghiệp (giá trị input, tải chậm).
  async assertCompany(c) {
    const ok = await this.page.waitForFunction((mst) => location.pathname.includes('/' + mst + '/') && (
      document.body.innerText.includes(mst) ||
      [...document.querySelectorAll('input')].some((i) => i.value && i.value.includes('(' + mst + ')'))
    ), c.mst, { timeout: STEP_TIMEOUT }).then(() => true, () => false);
    if (!ok) throw new Error(`Trang hiện tại không phải doanh nghiệp ${c.mst}`);
  }

  async openCompany(c) {
    await this.page.goto(`${this.base}/QLHD/${c.mst}/${c.guid}`, { waitUntil: 'domcontentloaded' });
    await this.page.waitForFunction(() => typeof jQuery === 'function' && document.querySelector('a[href="#tabHH"]'));
    await this.assertCompany(c);
  }

  // ---------- 1. Hóa đơn VÀO/RA ----------

  async syncInvoices(c, periods) {
    const p = this.page;
    await p.goto(`${this.base}/DongBo/${c.mst}/${c.guid}`, { waitUntil: 'domcontentloaded' });
    await p.waitForFunction(() => typeof jQuery === 'function' && jQuery('#cboQuy').data('dxSelectBox'));
    await this.assertCompany(c);
    const { cboValue, year, invoice } = periods;
    let shown = await p.evaluate(({ cboValue, year }) => {
      jQuery('#cboQuy').dxSelectBox('instance').option('value', cboValue);
      const nam = jQuery('#txtNam').data('dxNumberBox');
      if (nam) nam.option('value', year);
      return { from: jQuery('#dtTuNgay input.dx-texteditor-input').val(), to: jQuery('#dtDenNgay input.dx-texteditor-input').val() };
    }, { cboValue, year });
    if (shown.from !== invoice.fromText || shown.to !== invoice.toText) {
      shown = await this.setDates('', 'dtTuNgay', 'dtDenNgay', invoice.from, invoice.to);
    }
    if (shown.from !== invoice.fromText || shown.to !== invoice.toText) {
      throw new Error(`Không đặt được kỳ hóa đơn (đang là ${shown.from}–${shown.to})`);
    }
    this.checkStop();
    this.log(`  Hóa đơn: gửi đồng bộ VÀO/RA ${shown.from}–${shown.to}`);
    await p.locator('#btnGov').click();

    const t0 = Date.now();
    let status = '';
    while (Date.now() - t0 < TASK_TIMEOUT) {
      await p.waitForTimeout(2000);
      status = (await p.locator('#lblTrangThai').innerText().catch(() => '')).trim();
      if (/xong|lỗi|thất bại|không thành công/i.test(status)) break;
    }
    const panel = await p.evaluate(() => {
      let e = document.querySelector('#lblTrangThai');
      while (e && !/Từ ngày/.test(e.innerText)) e = e.parentElement;
      return e ? e.innerText : '';
    });
    const num = (re) => { const m = panel.match(re); return m ? Number(m[1].replace(/[.,]/g, '')) : null; };
    const res = {
      status,
      buy: num(/([\d.,]+)\s*ho[aá]\s*đơn mua vào/i),
      sell: num(/([\d.,]+)\s*ho[aá]\s*đơn bán ra/i),
      total: num(/Tổng số HĐ:\s*([\d.,]+)/i),
      rangeOk: panel.includes(`${invoice.fromText} đến ngày ${invoice.toText}`),
    };
    const done = /đồng bộ xong/i.test(status) && /Đồng bộ hóa đơn:\s*xong/i.test(panel) && res.rangeOk;
    if (done) return { state: 'hoan_tat', ...res, evidence: `Đồng bộ xong ${invoice.fromText}–${invoice.toText}: ${res.buy ?? '?'} mua vào, ${res.sell ?? '?'} bán ra, tổng ${res.total ?? '?'}` };
    if (/lỗi|thất bại|không thành công/i.test(status)) return { state: 'loi', ...res, evidence: panel.slice(0, 500) };
    return { state: 'chua_xac_minh', ...res, evidence: 'Hết 10 phút chưa thấy kết quả cuối. Trạng thái: ' + status };
  }

  // ---------- 2. Hàng hóa ----------

  async syncGoods(c, periods) {
    const p = this.page;
    await this.openCompany(c);
    await p.locator('a[href="#tabHH"]').click();
    await p.locator('#tabHH a', { hasText: 'Đồng bộ hàng hóa' }).click();
    await p.locator('#mDongBoHangHoa.show').waitFor();
    const d = await this.setDates('#mDongBoHangHoa', 'TuNgay', 'DenNgay', periods.catalog.from, periods.catalog.to);
    if (d.from !== periods.catalog.fromText || d.to !== periods.catalog.toText) throw new Error(`Không đặt được ngày hàng hóa (${d.from}–${d.to})`);
    await this.setChecked({ chkVao: true, chkRa: true, TinhChatHangHoa0: true, chkGanMaHangCoSan: false, chkHangHoaDacTrung: false });
    this.checkStop();
    this.log(`  Hàng hóa: gửi đồng bộ ${d.from}–${d.to}`);
    await p.locator('#btnDBHH').click();
    const confirm = await this.waitDialog(() => true, 30000);
    if (!confirm || !/ĐỒNG BỘ HÀNG HÓA/i.test(confirm) || !/chưa (có )?trong \[Hàng Hóa Nibot\]/i.test(confirm)) {
      return { state: 'loi', evidence: 'Hộp xác nhận khác dự kiến, không bấm Yes: ' + (confirm || 'không có') };
    }
    await this.clickDialogButton('Yes');
    const result = await this.waitDialog((t) => !/chắc cú/i.test(t));
    if (!result) return { state: 'chua_xac_minh', evidence: 'Hết 10 phút chưa có thông báo kết quả' };
    await this.clickDialogButton('OK').catch(() => {});
    return /hoàn tất/i.test(result) ? { state: 'hoan_tat', evidence: result.replace(/\s*OK$/, '') } : { state: 'loi', evidence: result };
  }

  // ---------- 3. ĐTPN ----------

  async syncPartners(c, periods, direction /* 'vao' | 'ra' */) {
    const p = this.page;
    await this.openCompany(c);
    await p.locator('a[href="#tabDTPN"]').click();
    await p.locator('#tabDTPN a', { hasText: 'Đồng bộ ĐTPN' }).click();
    await p.locator('#mDongBoDTPN.show').waitFor();
    const d = await this.setDates('#mDongBoDTPN', 'TuNgayDTPN', 'DenNgayDTPN', periods.catalog.from, periods.catalog.to);
    if (d.from !== periods.catalog.fromText || d.to !== periods.catalog.toText) throw new Error(`Không đặt được ngày ĐTPN (${d.from}–${d.to})`);
    await this.setChecked(direction === 'vao' ? { chkVaoDTPN: true, chkTaoMa: true } : { chkRaDTPN: true, chkTaoMa: true });
    this.checkStop();
    const label = direction === 'vao' ? 'ĐẦU VÀO' : 'ĐẦU RA';
    this.log(`  ĐTPN ${label}: gửi đồng bộ ${d.from}–${d.to}`);
    await p.locator('#btnDongBoDTPN').click();
    const confirm = await this.waitDialog(() => true, 30000);
    if (!confirm || !confirm.includes(`ĐỒNG BỘ ĐTPN ${label}`)) {
      return { state: 'loi', evidence: 'Hộp xác nhận khác dự kiến, không bấm Yes: ' + (confirm || 'không có') };
    }
    await this.clickDialogButton('Yes');
    const result = await this.waitDialog((t) => !/chắc cú/i.test(t));
    if (!result) return { state: 'chua_xac_minh', evidence: 'Hết 10 phút chưa có thông báo kết quả' };
    await this.clickDialogButton('OK').catch(() => {});
    return /hoàn tất/i.test(result) ? { state: 'hoan_tat', evidence: result.replace(/\s*OK$/, '') } : { state: 'loi', evidence: result };
  }
}

module.exports = { Nibot, StopError };
