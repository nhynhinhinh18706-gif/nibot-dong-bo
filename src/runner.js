// Điều phối một đợt chạy: tuần tự từng doanh nghiệp, từng công việc; lưu tiến độ sau mỗi bước.
const fs = require('fs');
const path = require('path');
const { Nibot, StopError } = require('./nibot');
const { buildPeriods } = require('./periods');

const TASKS = ['hoa_don', 'hang_hoa', 'dtpn_vao', 'dtpn_ra'];
const LABEL = { hoan_tat: 'Hoàn tất', loi: 'Lỗi', chua_chay: 'Chưa chạy', dang_chay: 'Đang chạy', chua_xac_minh: 'Chưa xác minh' };

async function runBatch({ nibot, companies, period, runsDir, emit }) {
  const periods = buildPeriods(period);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const progressFile = path.join(runsDir, `nibot_progress_${stamp}.json`);
  const reportFile = path.join(runsDir, `nibot_report_${stamp}.md`);
  fs.mkdirSync(runsDir, { recursive: true });

  const run = {
    startedAt: new Date().toISOString(), periods,
    companies: companies.map((c) => ({ ...c, tasks: Object.fromEntries(TASKS.map((t) => [t, { state: 'chua_chay' }])) })),
  };
  const save = () => fs.writeFileSync(progressFile, JSON.stringify(run, null, 1), 'utf8');
  const set = (c, task, r) => { c.tasks[task] = { ...r, at: new Date().toISOString() }; save(); emit('task', { mst: c.mst, task, ...c.tasks[task] }); };
  save();
  emit('log', `Kỳ hóa đơn: ${periods.label} (${periods.invoice.fromText}–${periods.invoice.toText}). Hàng hóa/ĐTPN: ${periods.catalog.fromText}–${periods.catalog.toText}.`);

  const guard = async (c, task, fn) => {
    set(c, task, { state: 'dang_chay' });
    try { const r = await fn(); set(c, task, r); return r; }
    catch (e) {
      if (e instanceof StopError) { set(c, task, { state: 'chua_xac_minh', evidence: 'Dừng giữa chừng, cần kiểm tra trên Nibot' }); throw e; }
      const r = { state: 'loi', evidence: e.message }; set(c, task, r); return r;
    }
  };

  try {
    for (let i = 0; i < run.companies.length; i++) {
      const c = run.companies[i];
      nibot.checkStop();
      emit('log', `[${i + 1}/${run.companies.length}] ${c.name} (${c.mst})`);
      const inv = await guard(c, 'hoa_don', () => nibot.syncInvoices(c, periods));
      if (inv.state === 'chua_xac_minh') { emit('log', '  Hóa đơn chưa xác minh được, tạm dừng đợt chạy để tránh chạy chồng.'); break; }
      if (inv.state !== 'hoan_tat') {
        for (const t of TASKS.slice(1)) set(c, t, { state: 'chua_chay', evidence: 'Chưa chạy do hóa đơn lỗi' });
        continue;
      }
      const goods = await guard(c, 'hang_hoa', () => nibot.syncGoods(c, periods));
      if (goods.state === 'chua_xac_minh') break;
      const vao = await guard(c, 'dtpn_vao', () => nibot.syncPartners(c, periods, 'vao'));
      if (vao.state === 'chua_xac_minh') break;
      const ra = await guard(c, 'dtpn_ra', () => nibot.syncPartners(c, periods, 'ra'));
      if (ra.state === 'chua_xac_minh') break;

      const done = TASKS.filter((t) => c.tasks[t].state === 'hoan_tat').length;
      emit('log', `  → ${done}/4 việc hoàn tất`);
    }
  } catch (e) {
    if (!(e instanceof StopError)) emit('log', 'Lỗi: ' + e.message); else emit('log', 'Đã dừng theo yêu cầu.');
  }

  run.finishedAt = new Date().toISOString();
  save();
  fs.writeFileSync(reportFile, buildReport(run), 'utf8');
  return { run, progressFile, reportFile };
}

function buildReport(run) {
  const { periods } = run;
  const lines = [
    `# Báo cáo đồng bộ Nibot — ${periods.label}`, '',
    `- Ngày chạy: ${periods.runDate}`,
    `- Kỳ hóa đơn: ${periods.invoice.fromText} – ${periods.invoice.toText}`,
    `- Hàng hóa/ĐTPN: ${periods.catalog.fromText} – ${periods.catalog.toText}`, '',
    '| Tên | MST | Hóa đơn | Mua vào | Bán ra | Hàng hóa | ĐTPN vào | ĐTPN ra | Ghi chú |',
    '|---|---|---|---|---|---|---|---|---|',
  ];
  const groups = { ok: 0, err: 0, todo: 0, check: 0 };
  for (const c of run.companies) {
    const st = TASKS.map((t) => c.tasks[t].state);
    if (st.every((s) => s === 'hoan_tat')) groups.ok++;
    else if (st.some((s) => s === 'chua_xac_minh' || s === 'dang_chay')) groups.check++;
    else if (st.some((s) => s === 'loi')) groups.err++;
    else groups.todo++;
    const notes = TASKS.filter((t) => c.tasks[t].state !== 'hoan_tat' && c.tasks[t].evidence).map((t) => `${t}: ${c.tasks[t].evidence}`).join('; ');
    lines.push(`| ${c.name} | ${c.mst} | ${LABEL[st[0]]} | ${c.tasks.hoa_don.buy ?? ''} | ${c.tasks.hoa_don.sell ?? ''} | ${LABEL[st[1]]} | ${LABEL[st[2]]} | ${LABEL[st[3]]} | ${notes.replace(/\|/g, '/').replace(/\n/g, ' ')} |`);
  }
  lines.push('', `**Tổng:** ${run.companies.length} doanh nghiệp — hoàn tất ${groups.ok}, có lỗi ${groups.err}, chưa xử lý ${groups.todo}, cần kiểm tra ${groups.check}.`);
  return lines.join('\n') + '\n';
}

module.exports = { runBatch, buildReport, Nibot };
