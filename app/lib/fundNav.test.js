import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeFundNavRows, parseFundDividend } from './fundNav.js';

test('normalizeFundNavRows parses, filters, deduplicates, and sorts mobile API rows', () => {
  assert.deepEqual(
    normalizeFundNavRows([
      { FSRQ: '2026-07-15', DWJZ: '7.7386', JZZZL: '-3.21' },
      { FSRQ: 'invalid', DWJZ: '1.0', JZZZL: '1.00' },
      { FSRQ: '2026-07-14', DWJZ: '7.9949', JZZZL: '10.09' },
      { FSRQ: '2026-07-15', DWJZ: '7.7386', JZZZL: '--' }
    ]),
    [
      { date: '2026-07-14', nav: 7.9949, growth: 10.09, dividend: null },
      { date: '2026-07-15', nav: 7.7386, growth: null, dividend: null }
    ]
  );
});

test('parseFundDividend extracts per-unit cash distributions only', () => {
  assert.equal(parseFundDividend('每份派现金0.1250元'), 0.125);
  assert.equal(parseFundDividend('暂无分红'), null);
  assert.equal(parseFundDividend('1.2345'), null);
});
