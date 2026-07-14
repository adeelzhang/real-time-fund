export const LOCAL_UPDATED_AT_KEY = 'localUpdatedAt';
export const LOCAL_DATA_TOUCHED_KEY = 'localUserDataTouched';
export const LOCAL_FUNDS_TOUCHED_KEY = 'localFundsTouched';

const ARRAY_DATA_KEYS = [
  'funds',
  'tags',
  'favorites',
  'collapsedCodes',
  'collapsedTrends',
  'collapsedValuationTrends',
  'collapsedEarnings',
  'pendingTrades'
];

const OBJECT_DATA_KEYS = [
  'holdings',
  'groupHoldings',
  'transactions',
  'dcaPlans',
  'customSettings',
  'fundDailyEarnings',
  'fundDividends'
];

const hasNestedValue = (value) => {
  if (Array.isArray(value)) return value.length > 0;
  if (value && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.values(value).some(hasNestedValue);
  }
  return value !== null && value !== undefined;
};

export const parseSyncTimestampMs = (value) => {
  if (!value) return 0;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
};

export const hasMeaningfulSyncPayload = (payload) => {
  if (!payload || Object.getPrototypeOf(payload) !== Object.prototype) return false;

  if (ARRAY_DATA_KEYS.some((key) => Array.isArray(payload[key]) && payload[key].length > 0)) {
    return true;
  }

  if (
    Array.isArray(payload.groups) &&
    payload.groups.some((group) => {
      if (!group || Object.getPrototypeOf(group) !== Object.prototype) return false;
      const id = String(group.id ?? '').trim();
      const isPreset = group.isPreset === true || id === 'fav';
      return (Array.isArray(group.codes) && group.codes.length > 0) || (!isPreset && Boolean(id));
    })
  ) {
    return true;
  }

  if (OBJECT_DATA_KEYS.some((key) => hasNestedValue(payload[key]))) {
    return true;
  }

  const refreshMs = Number(payload.refreshMs);
  return Number.isFinite(refreshMs) && refreshMs !== 30000;
};

export const getEffectiveLocalTimestampMs = (payload, timestamp, locallyTouched = false) => {
  if (!locallyTouched && !hasMeaningfulSyncPayload(payload)) return 0;
  return parseSyncTimestampMs(timestamp);
};

export const shouldPreferCloudFundData = (localPayload, cloudPayload, localFundsTouched = false) => {
  const localFunds = Array.isArray(localPayload?.funds) ? localPayload.funds : [];
  const cloudFunds = Array.isArray(cloudPayload?.funds) ? cloudPayload.funds : [];
  return !localFundsTouched && localFunds.length === 0 && cloudFunds.length > 0;
};
