// Tính kỳ đồng bộ theo giờ Việt Nam (UTC+7).
// Kỳ hóa đơn: { kind: 'quy' | 'thang', n, year } — trọn quý hoặc trọn tháng.

const pad = (n) => String(n).padStart(2, '0');
const fmt = (d) => `${pad(d.d)}/${pad(d.m)}/${d.y}`;

// Ngày hiện tại tại Việt Nam, không phụ thuộc múi giờ máy.
function todayVN(now = new Date()) {
  const vn = new Date(now.getTime() + 7 * 3600 * 1000);
  return { y: vn.getUTCFullYear(), m: vn.getUTCMonth() + 1, d: vn.getUTCDate() };
}

function currentPeriod(kind = 'quy', now = new Date()) {
  const t = todayVN(now);
  return { kind, n: kind === 'thang' ? t.m : Math.ceil(t.m / 3), year: t.y };
}

const periodLabel = ({ kind, n, year }) => `${kind === 'thang' ? 'Tháng' : 'Quý'} ${n}/${year}`;

// Hóa đơn: trọn quý/tháng. Hàng hóa/ĐTPN: 01/01 năm đó → hôm nay (năm hiện tại) hoặc 31/12 (năm cũ).
function buildPeriods({ kind, n, year }, now = new Date()) {
  if (kind !== 'quy' && kind !== 'thang') throw new Error('Loại kỳ không hợp lệ');
  const max = kind === 'quy' ? 4 : 12;
  if (!Number.isInteger(n) || n < 1 || n > max) throw new Error(kind === 'quy' ? 'Quý không hợp lệ' : 'Tháng không hợp lệ');
  const t = todayVN(now);
  if (!Number.isInteger(year) || year > t.y) throw new Error('Năm không được lớn hơn năm hiện tại');
  const startM = kind === 'quy' ? (n - 1) * 3 + 1 : n;
  const endM = kind === 'quy' ? startM + 2 : n;
  const lastDay = new Date(Date.UTC(year, endM, 0)).getUTCDate();
  const invoice = { from: { y: year, m: startM, d: 1 }, to: { y: year, m: endM, d: lastDay } };
  const catalog = { from: { y: year, m: 1, d: 1 }, to: year === t.y ? t : { y: year, m: 12, d: 31 } };
  return {
    runDate: fmt(t),
    kind,
    n,
    year,
    label: periodLabel({ kind, n, year }),
    cboValue: `${kind === 'thang' ? 'Tháng' : 'Quý'} ${n}`, // giá trị trong ô "Chọn khoảng Thời gian" của Nibot
    invoice: { ...invoice, fromText: fmt(invoice.from), toText: fmt(invoice.to) },
    catalog: { ...catalog, fromText: fmt(catalog.from), toText: fmt(catalog.to) },
  };
}

module.exports = { todayVN, currentPeriod, periodLabel, buildPeriods, fmt };
