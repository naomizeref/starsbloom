import assert from 'node:assert/strict';
import test from 'node:test';
import { formatMarketPrice, formatMarketChange } from '../src/lib/tradingDisplay';

test('market labels retain small coin values and keep large prices readable', () => {
  assert.equal(formatMarketPrice(77358), '$77,358.00');
  assert.equal(formatMarketPrice(0.00001234), '$0.00001234');
  assert.equal(formatMarketPrice(0.075), '$0.075');
  assert.notEqual(formatMarketPrice(1e-12), '$0.00');
  for (const invalid of [0, -1, NaN, Infinity]) assert.equal(formatMarketPrice(invalid), '—');
});

test('daily changes use consistent precision without negative zero', () => {
  assert.equal(formatMarketChange(0.14728), '+0.15%');
  assert.equal(formatMarketChange(-0.77782), '-0.78%');
  assert.equal(formatMarketChange(-0.001), '+0.00%');
  assert.equal(formatMarketChange(NaN), '—');
});
