import assert from 'node:assert/strict';
import test from 'node:test';
import { getEffectiveLocalTimestampMs, hasMeaningfulSyncPayload, shouldPreferCloudFundData } from './syncState.js';

const RECENT_TIMESTAMP = '2026-07-15T10:00:00.000Z';

test('fresh local defaults are not treated as user data', () => {
  const payload = {
    funds: [],
    groups: [{ id: 'fav', name: '自选', isPreset: true, codes: [] }],
    dcaPlans: { global: {} },
    refreshMs: 30000,
    customSettings: {}
  };

  assert.equal(hasMeaningfulSyncPayload(payload), false);
  assert.equal(getEffectiveLocalTimestampMs(payload, RECENT_TIMESTAMP), 0);
});

test('a contaminated timestamp cannot make a pristine local payload newer', () => {
  assert.equal(getEffectiveLocalTimestampMs({ funds: [] }, RECENT_TIMESTAMP, false), 0);
});

test('real local fund data keeps its timestamp', () => {
  const expected = new Date(RECENT_TIMESTAMP).getTime();
  assert.equal(getEffectiveLocalTimestampMs({ funds: [{ code: '006503' }] }, RECENT_TIMESTAMP), expected);
});

test('an explicit user mutation preserves an intentionally emptied payload', () => {
  const expected = new Date(RECENT_TIMESTAMP).getTime();
  assert.equal(getEffectiveLocalTimestampMs({ funds: [] }, RECENT_TIMESTAMP, true), expected);
});

test('custom groups and settings count as user data without funds', () => {
  assert.equal(hasMeaningfulSyncPayload({ groups: [{ id: 'watch-later', name: '稍后看', codes: [] }] }), true);
  assert.equal(hasMeaningfulSyncPayload({ customSettings: { gaussianBlurEnabled: false } }), true);
});

test('settings changes cannot let an untouched empty fund list replace cloud funds', () => {
  const localPayload = { funds: [], customSettings: { gaussianBlurEnabled: false } };
  const cloudPayload = { funds: [{ code: '006503' }] };
  assert.equal(shouldPreferCloudFundData(localPayload, cloudPayload, false), true);
});

test('an explicitly emptied fund list can be synchronized', () => {
  const localPayload = { funds: [] };
  const cloudPayload = { funds: [{ code: '006503' }] };
  assert.equal(shouldPreferCloudFundData(localPayload, cloudPayload, true), false);
});
