const test = require('node:test');
const assert = require('node:assert');
const { buildPeriods, currentPeriod } = require('../src/periods');

// 20/10/2026 02:34 giờ VN = 19/10/2026 19:34 UTC
const now = new Date('2026-10-19T19:34:00Z');
const quy = (n, year) => buildPeriods({ kind: 'quy', n, year }, now);
const thang = (n, year) => buildPeriods({ kind: 'thang', n, year }, now);

test('ngày chạy theo giờ Việt Nam', () => {
  assert.deepStrictEqual(currentPeriod('quy', now), { kind: 'quy', n: 4, year: 2026 });
  assert.deepStrictEqual(currentPeriod('thang', now), { kind: 'thang', n: 10, year: 2026 });
  assert.strictEqual(quy(4, 2026).runDate, '20/10/2026');
});

test('quý 4 năm hiện tại', () => {
  const p = quy(4, 2026);
  assert.strictEqual(p.invoice.fromText, '01/10/2026');
  assert.strictEqual(p.invoice.toText, '31/12/2026');
  assert.strictEqual(p.catalog.fromText, '01/01/2026');
  assert.strictEqual(p.catalog.toText, '20/10/2026');
  assert.strictEqual(p.cboValue, 'Quý 4');
  assert.strictEqual(p.label, 'Quý 4/2026');
});

test('quý 1 trọn quý, quý 2 tới 30/06', () => {
  assert.strictEqual(quy(1, 2024).invoice.toText, '31/03/2024');
  assert.strictEqual(quy(2, 2026).invoice.toText, '30/06/2026');
});

test('tháng: trọn tháng, kể cả tháng 2 năm nhuận', () => {
  const p = thang(10, 2026);
  assert.strictEqual(p.invoice.fromText, '01/10/2026');
  assert.strictEqual(p.invoice.toText, '31/10/2026');
  assert.strictEqual(p.cboValue, 'Tháng 10');
  assert.strictEqual(p.label, 'Tháng 10/2026');
  assert.strictEqual(p.catalog.toText, '20/10/2026');
  assert.strictEqual(thang(2, 2024).invoice.toText, '29/02/2024');
  assert.strictEqual(thang(2, 2026).invoice.toText, '28/02/2026');
  assert.strictEqual(thang(4, 2026).invoice.toText, '30/04/2026');
});

test('năm cũ: hàng hóa/ĐTPN tới 31/12', () => {
  assert.strictEqual(quy(3, 2025).catalog.toText, '31/12/2025');
  assert.strictEqual(thang(5, 2025).catalog.toText, '31/12/2025');
});

test('chặn năm tương lai, quý/tháng sai', () => {
  assert.throws(() => quy(1, 2027));
  assert.throws(() => quy(5, 2026));
  assert.throws(() => thang(13, 2026));
  assert.throws(() => thang(0, 2026));
  assert.throws(() => buildPeriods({ kind: 'nam', n: 1, year: 2026 }, now));
});
