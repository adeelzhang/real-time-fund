'use client';

import { useEffect, useMemo, useState } from 'react';
import { isArray } from 'lodash';
import { fetchFundManagerHoldings, fetchStockIntradayBatch } from '@/app/api/fund';

const asNumber = (value) => {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const buildFundIntradayFromHoldings = (holdings, intradayByCode, referenceNav, equityExposurePct) => {
  if (!isArray(holdings) || !intradayByCode || referenceNav == null) return { series: [], date: null };
  const equityExposure = asNumber(equityExposurePct);
  const seriesRows = holdings
    .map((holding) => {
      const quote = intradayByCode[holding.code];
      const points = quote?.points;
      const weight = asNumber(String(holding.weight ?? '').replace('%', ''));
      const firstPrice = asNumber(points?.[0]?.price);
      const quotedPreviousClose = asNumber(quote?.previousClose);
      if (!isArray(points) || points.length < 2 || weight == null || weight <= 0 || firstPrice == null) return null;
      const previousClose = quotedPreviousClose && quotedPreviousClose > 0 ? quotedPreviousClose : firstPrice;
      return { points, weight, previousClose, date: quote?.date || null };
    })
    .filter(Boolean);

  const totalWeight = seriesRows.reduce((sum, item) => sum + item.weight, 0);
  if (seriesRows.length === 0 || totalWeight <= 0) return { series: [], date: null };

  const sessionDates = new Set(seriesRows.map((item) => item.date).filter(Boolean));
  const times = [...new Set(seriesRows.flatMap((item) => item.points.map((point) => point.time)))].sort();
  const priceMaps = seriesRows.map((item) => ({
    ...item,
    prices: new Map(item.points.map((point) => [point.time, point.price])),
    lastPrice: asNumber(item.points[0]?.price)
  }));
  const resolvedDate = sessionDates.size === 1 ? [...sessionDates][0] : null;

  const series = times.map((time) => {
    let weightedChange = 0;
    priceMaps.forEach((item) => {
      const currentPrice = asNumber(item.prices.get(time));
      if (currentPrice != null) item.lastPrice = currentPrice;
      if (item.lastPrice == null) return;
      weightedChange += ((item.lastPrice / item.previousClose - 1) * 100 * item.weight) / totalWeight;
    });
    const percentage = weightedChange * ((equityExposure ?? 100) / 100);
    return {
      time,
      value: referenceNav * (1 + percentage / 100),
      date: resolvedDate
    };
  });

  return { series, date: resolvedDate };
};

export function useFundManagerIntraday(fundCode, referenceNav) {
  const [topHoldings, setTopHoldings] = useState(null);
  const [stockIntraday, setStockIntraday] = useState({});
  const [holdingsLoading, setHoldingsLoading] = useState(false);

  useEffect(() => {
    if (!fundCode) {
      setTopHoldings(null);
      setHoldingsLoading(false);
      return;
    }
    let cancelled = false;
    setTopHoldings(null);
    setStockIntraday({});
    setHoldingsLoading(true);
    fetchFundManagerHoldings(fundCode)
      .then((result) => {
        if (!cancelled) setTopHoldings(result || null);
      })
      .catch(() => {
        if (!cancelled) setTopHoldings(null);
      })
      .finally(() => {
        if (!cancelled) setHoldingsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fundCode]);

  const holdingRows = useMemo(() => (isArray(topHoldings?.holdings) ? topHoldings.holdings : []), [topHoldings]);

  useEffect(() => {
    if (holdingRows.length === 0) {
      setStockIntraday({});
      return;
    }
    let cancelled = false;
    fetchStockIntradayBatch(holdingRows)
      .then((result) => {
        if (!cancelled) setStockIntraday(result || {});
      })
      .catch(() => {
        if (!cancelled) setStockIntraday({});
      });
    return () => {
      cancelled = true;
    };
  }, [holdingRows]);

  const intradayResult = useMemo(
    () =>
      buildFundIntradayFromHoldings(holdingRows, stockIntraday, asNumber(referenceNav), topHoldings?.equityExposurePct),
    [holdingRows, stockIntraday, referenceNav, topHoldings?.equityExposurePct]
  );

  const stockQuoteDates = useMemo(
    () => [
      ...new Set(
        Object.values(stockIntraday)
          .map((quote) => quote?.date)
          .filter(Boolean)
      )
    ],
    [stockIntraday]
  );

  return {
    topHoldings,
    holdingRows,
    allocationRows: isArray(topHoldings?.assetAllocation) ? topHoldings.assetAllocation : [],
    stockIntraday,
    holdingsLoading,
    series: intradayResult.series,
    date: intradayResult.date,
    hasIntraday: intradayResult.series.length >= 2,
    stockQuoteDate: stockQuoteDates.length === 1 ? stockQuoteDates[0] : null
  };
}
