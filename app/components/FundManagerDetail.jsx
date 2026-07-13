'use client';

import { useEffect, useState } from 'react';
import { ChevronDown, ChevronLeft } from 'lucide-react';
import { isArray } from 'lodash';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { formatMoney } from '@/lib/utils';
import { fetchFundHistory, fetchFundHoldings, fetchStockIntradayBatch } from '../api/fund';
import * as qk from '../lib/query-keys';
import { useModalStore, useStorageStore } from '../stores';
import FundIntradayChart from './FundIntradayChart';
import FundManagerSparkline from './FundManagerSparkline';
import FundTrendChart from './FundTrendChart';

const selectSubModalOpen = (state) =>
  state.dataSourceModal.open ||
  state.tradeModal.open ||
  state.holdingModal.open ||
  state.dcaModal.open ||
  state.dividendMethodModal.open ||
  state.convertModal.open ||
  state.fundTagsEdit.open ||
  state.historyModal.open ||
  state.actionModal.open ||
  state.selectHoldingGroupModal.open ||
  state.addHistoryModal.open;

const asNumber = (value) => {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const formatNav = (value) => {
  const parsed = asNumber(value);
  return parsed == null ? '—' : parsed.toFixed(4);
};

const formatPercent = (value) => {
  const parsed = asNumber(value);
  if (parsed == null) return '—';
  return `${parsed > 0 ? '+' : ''}${parsed.toFixed(2)}%`;
};

const formatAmount = (value, masked) => {
  if (masked) return '******';
  const parsed = asNumber(value);
  if (parsed == null) return '—';
  return `${parsed > 0 ? '+' : parsed < 0 ? '-' : ''}${formatMoney(Math.abs(parsed))}`;
};

const getDeltaClass = (value) => {
  const parsed = asNumber(value);
  if (parsed == null || parsed === 0) return '';
  return parsed > 0 ? 'up' : 'down';
};

const formatDate = (value) => {
  if (!value) return '—';
  const text = String(value);
  const match = text.match(/(\d{4}-\d{2}-\d{2})/);
  return match?.[1] || text.slice(0, 10);
};

const buildAnnualReturns = (history) => {
  if (!isArray(history)) return [];
  const sorted = [...history].filter((item) => item?.date).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const years = new Map();
  sorted.forEach((item) => {
    const year = String(item.date).slice(0, 4);
    const value = asNumber(item.accumulatedNetValue) ?? asNumber(item.unitNetValue) ?? asNumber(item.value);
    if (!/^\d{4}$/.test(year) || value == null) return;
    const current = years.get(year);
    if (!current) years.set(year, { year, first: value, last: value });
    else current.last = value;
  });
  return [...years.values()]
    .map((item) => ({
      year: item.year,
      value: item.first ? ((item.last - item.first) / item.first) * 100 : null
    }))
    .filter((item) => item.value != null)
    .reverse();
};

const buildHistoryRows = (history) => {
  if (!isArray(history)) return [];
  const sorted = [...history].filter((item) => item?.date).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return sorted
    .map((item, index) => {
      const previous = sorted[index - 1];
      const unitNetValue = asNumber(item.unitNetValue) ?? asNumber(item.value);
      const previousNav = asNumber(previous?.unitNetValue) ?? asNumber(previous?.value);
      const dailyChange =
        asNumber(item.equityReturn) ??
        (unitNetValue != null && previousNav ? ((unitNetValue - previousNav) / previousNav) * 100 : null);
      return {
        date: item.date,
        unitNetValue,
        accumulatedNetValue: asNumber(item.accumulatedNetValue),
        dailyChange
      };
    })
    .reverse();
};

const buildFundIntradayFromHoldings = (holdings, intradayByCode, referenceNav) => {
  if (!isArray(holdings) || !intradayByCode || referenceNav == null) return [];
  const seriesRows = holdings
    .map((holding) => {
      const points = intradayByCode[holding.code];
      const weight = asNumber(String(holding.weight ?? '').replace('%', ''));
      if (!isArray(points) || points.length < 2 || weight == null || weight <= 0) return null;
      const firstPrice = asNumber(points[0]?.price);
      if (!firstPrice) return null;
      return { points, weight, firstPrice };
    })
    .filter(Boolean);
  if (seriesRows.length === 0) return [];

  const times = [...new Set(seriesRows.flatMap((item) => item.points.map((point) => point.time)))].sort();
  const priceMaps = seriesRows.map((item) => ({
    ...item,
    prices: new Map(item.points.map((point) => [point.time, point.price]))
  }));
  return times
    .map((time) => {
      let weightedChange = 0;
      let availableWeight = 0;
      priceMaps.forEach((item) => {
        const price = asNumber(item.prices.get(time));
        if (price == null) return;
        weightedChange += ((price - item.firstPrice) / item.firstPrice) * 100 * item.weight;
        availableWeight += item.weight;
      });
      if (!availableWeight) return null;
      const percentage = weightedChange / availableWeight;
      return {
        time,
        value: referenceNav * (1 + percentage / 100)
      };
    })
    .filter(Boolean);
};

function Metric({ label, value, delta, masked = false }) {
  return (
    <div className="fund-manager-metric">
      <span>{label}</span>
      <strong className={masked ? '' : getDeltaClass(delta)}>{value}</strong>
    </div>
  );
}

function SectionTitle({ children, value, valueDelta }) {
  return (
    <div className="fund-manager-section-heading">
      <h3>{children}</h3>
      {value ? <strong className={getDeltaClass(valueDelta)}>{value}</strong> : null}
    </div>
  );
}

export default function FundManagerDetail({ row, getFundCardProps, onClose, blockClose = false }) {
  const isAnySubModalOpen = useModalStore(selectSubModalOpen);
  const funds = useStorageStore((state) => state.funds);
  const [topHoldings, setTopHoldings] = useState(null);
  const [stockIntraday, setStockIntraday] = useState({});
  const [holdingsLoading, setHoldingsLoading] = useState(false);
  const [annualExpanded, setAnnualExpanded] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [historyVisibleCount, setHistoryVisibleCount] = useState(100);
  const finalBlockClose = blockClose || isAnySubModalOpen;
  const cardProps = row && getFundCardProps ? getFundCardProps(row) : null;
  const fallbackFund = cardProps?.fallbackFund || row?.rawFund || row || {};
  const fundCode = fallbackFund.code || row?.code || '';
  const fund = funds?.find((item) => item.code === fundCode) || fallbackFund;
  const fundName = fund.name || fund.fundName || row?.fundName || '基金详情';
  const holding = cardProps?.holdings?.[fundCode];
  const profit = cardProps?.getHoldingProfit?.(fund, holding) ?? null;
  const masked = Boolean(cardProps?.masked);
  const disclosedHoldings = topHoldings?.holdings;
  const holdingRows = isArray(disclosedHoldings) ? disclosedHoldings : [];
  const allocationRows = isArray(topHoldings?.assetAllocation) ? topHoldings.assetAllocation : [];

  const {
    data: fullHistory = [],
    isPending: historyLoading,
    isError: historyError
  } = useQuery({
    queryKey: qk.fundHistory(fundCode, 'all', 'accumulated'),
    queryFn: () => fetchFundHistory(fundCode, 'all', { netValueType: 'accumulated' }),
    enabled: Boolean(fundCode),
    staleTime: 10 * 60 * 1000
  });

  useEffect(() => {
    if (!fundCode) return;
    let cancelled = false;
    setHoldingsLoading(true);
    fetchFundHoldings(fundCode)
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

  useEffect(() => {
    if (!isArray(disclosedHoldings) || disclosedHoldings.length === 0) {
      setStockIntraday({});
      return;
    }
    let cancelled = false;
    fetchStockIntradayBatch(disclosedHoldings)
      .then((result) => {
        if (!cancelled) setStockIntraday(result || {});
      })
      .catch(() => {
        if (!cancelled) setStockIntraday({});
      });
    return () => {
      cancelled = true;
    };
  }, [disclosedHoldings]);

  const currentNav = asNumber(fund.gsz) ?? asNumber(fund.dwjz);
  const currentChange = asNumber(fund.gszzl) ?? asNumber(fund.zzl);
  const displayDate = formatDate(fund.gztime || fund.time || fund.jzrq);
  const costNav = asNumber(holding?.cost);
  const holdingShare = asNumber(holding?.share);
  const totalGain = asNumber(profit?.profitTotal);
  const dayGain = asNumber(profit?.profitToday);
  const currentSeries = fund.fundValuationTimeseries?.[fundCode] || cardProps?.valuationSeries?.[fundCode] || [];
  const derivedIntraday = buildFundIntradayFromHoldings(holdingRows, stockIntraday, asNumber(fund.dwjz));
  const effectiveIntraday = isArray(currentSeries) && currentSeries.length >= 2 ? currentSeries : derivedIntraday;
  const hasIntraday = effectiveIntraday.length >= 2;
  const transactions = profit ? cardProps?.transactions?.[fundCode] || [] : [];
  const periodMetrics = [
    ['近1月', cardProps?.fundExtraData?.month],
    ['近3月', cardProps?.fundExtraData?.month3],
    ['近6月', cardProps?.fundExtraData?.month6],
    ['近1年', cardProps?.fundExtraData?.year1]
  ];
  const annualRows = buildAnnualReturns(fullHistory);
  const historyRows = buildHistoryRows(fullHistory);

  const requestClose = () => {
    if (!finalBlockClose) onClose?.();
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && typeof document !== 'undefined' && document.body.hasAttribute('data-photo-viewer-open')) return;
        if (!open) requestClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        disableDefaultTranslate
        overlayClassName="fund-detail-overlay-no-blur"
        className="fund-manager-detail-shell fund-detail-surface-flat"
        onPointerDownOutside={(event) => {
          if (
            finalBlockClose ||
            (typeof document !== 'undefined' && document.body.hasAttribute('data-photo-viewer-open'))
          ) {
            event.preventDefault();
          }
        }}
        onEscapeKeyDown={(event) => {
          if (
            finalBlockClose ||
            (typeof document !== 'undefined' && document.body.hasAttribute('data-photo-viewer-open'))
          ) {
            event.preventDefault();
          }
        }}
      >
        <header className="fund-manager-detail-header">
          <button type="button" className="fund-manager-detail-back" onClick={requestClose} aria-label="返回基金列表">
            <ChevronLeft aria-hidden size={24} strokeWidth={2} />
          </button>
          <div className="fund-manager-detail-heading">
            <DialogTitle className="fund-manager-detail-title">{fundName}</DialogTitle>
            {fundCode ? <span className="fund-manager-detail-code">{fundCode}</span> : null}
          </div>
          <span className="fund-manager-detail-header-spacer" aria-hidden />
        </header>

        <main className="fund-manager-detail-body scrollbar-y-styled">
          <div className="fund-manager-detail-content">
            <section className="fund-manager-hero" aria-label="基金净值与持仓摘要">
              <span className="fund-manager-hero-label">净值 ({displayDate})</span>
              <div className="fund-manager-nav-row">
                <strong>{formatNav(currentNav)}</strong>
                <span className={getDeltaClass(currentChange)}>{formatPercent(currentChange)}</span>
              </div>
              <div className="fund-manager-metrics">
                <Metric label="持仓成本" value={masked ? '******' : formatNav(costNav)} masked={masked} />
                <Metric
                  label="持有份额"
                  value={masked || holdingShare == null ? (masked ? '******' : '—') : formatMoney(holdingShare)}
                  masked={masked}
                />
                <Metric label="持有收益" value={formatAmount(totalGain, masked)} delta={totalGain} masked={masked} />
                <Metric label="日收益" value={formatAmount(dayGain, masked)} delta={dayGain} masked={masked} />
              </div>
            </section>

            <section className="fund-manager-section fund-manager-trend-section">
              <SectionTitle>累计收益走势</SectionTitle>
              <FundTrendChart
                code={fundCode}
                isExpanded
                onToggleExpand={() => {}}
                transactions={transactions}
                theme={cardProps?.theme || 'dark'}
                hideHeader
                showHistory={false}
              />
            </section>

            <section className="fund-manager-section">
              <SectionTitle value={formatPercent(currentChange)} valueDelta={currentChange}>
                日内走势
              </SectionTitle>
              {hasIntraday ? (
                <div className="fund-manager-intraday">
                  <FundIntradayChart
                    series={effectiveIntraday}
                    referenceNav={asNumber(fund.dwjz) ?? undefined}
                    theme={cardProps?.theme || 'dark'}
                    fundCode={fundCode}
                    valuationSource={fund.valuationSource}
                    gztime={fund.gztime}
                    todayStr={cardProps?.todayStr}
                  />
                </div>
              ) : (
                <div className="fund-manager-empty">暂无可用的日内行情</div>
              )}
            </section>

            <section className="fund-manager-section">
              <SectionTitle>阶段收益</SectionTitle>
              <div className="fund-manager-period-grid">
                {periodMetrics.map(([label, value]) => (
                  <Metric key={label} label={label} value={formatPercent(value)} delta={value} />
                ))}
              </div>
            </section>

            <section className="fund-manager-section">
              <SectionTitle>当前基金持仓明细</SectionTitle>
              {allocationRows.length > 0 ? (
                <div className="fund-manager-allocation-row">
                  {allocationRows.map((item) => (
                    <span key={item.name}>
                      {item.name} <strong>{formatPercent(item.value).replace('+', '')}</strong>
                    </span>
                  ))}
                </div>
              ) : null}
              {holdingsLoading ? (
                <div className="fund-manager-empty">加载持仓中...</div>
              ) : holdingRows.length > 0 ? (
                <div className="fund-manager-holdings">
                  <div className="fund-manager-holding-head">
                    <span>股票名称</span>
                    <span>日内走势</span>
                    <span>最新涨跌</span>
                    <span>持仓占比</span>
                  </div>
                  {holdingRows.map((item, index) => {
                    const change = asNumber(item.change);
                    const weight = asNumber(String(item.weight ?? '').replace('%', ''));
                    const stockSeries = stockIntraday[item.code] || [];
                    return (
                      <div className="fund-manager-holding-row" key={`${item.code || item.name}-${index}`}>
                        <span className="fund-manager-holding-name">
                          <strong>{item.name || '—'}</strong>
                          {item.code ? <small>{item.code}</small> : null}
                        </span>
                        <span className="fund-manager-holding-sparkline">
                          <FundManagerSparkline
                            values={stockSeries.map((point) => point.price)}
                            positive={change >= 0}
                          />
                        </span>
                        <strong className={getDeltaClass(change)}>{formatPercent(change)}</strong>
                        <span className="fund-manager-weight">
                          <strong>{weight == null ? '—' : `${weight.toFixed(2)}%`}</strong>
                          <i style={{ width: `${Math.min(Math.max(weight || 0, 0) * 5, 100)}%` }} />
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="fund-manager-empty">暂无持仓明细</div>
              )}
            </section>

            <section className="fund-manager-section">
              <button
                type="button"
                className="fund-manager-collapsible-heading"
                aria-expanded={annualExpanded}
                onClick={() => setAnnualExpanded((value) => !value)}
              >
                <span>年度回报</span>
                <ChevronDown className={annualExpanded ? 'expanded' : ''} size={18} aria-hidden />
              </button>
              {annualExpanded ? (
                historyLoading ? (
                  <div className="fund-manager-empty">加载年度回报中...</div>
                ) : annualRows.length > 0 ? (
                  <div className="fund-manager-annual-table">
                    <div className="fund-manager-annual-row fund-manager-table-head">
                      <span>年度</span>
                      <span>回报率</span>
                    </div>
                    {annualRows.map((item) => (
                      <div className="fund-manager-annual-row" key={item.year}>
                        <span>{item.year}</span>
                        <strong className={getDeltaClass(item.value)}>{formatPercent(item.value)}</strong>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="fund-manager-empty">{historyError ? '年度回报加载失败' : '暂无年度回报'}</div>
                )
              ) : null}
            </section>

            <section className="fund-manager-section">
              <button
                type="button"
                className="fund-manager-collapsible-heading"
                aria-expanded={historyExpanded}
                onClick={() => setHistoryExpanded((value) => !value)}
              >
                <span>历史净值</span>
                <ChevronDown className={historyExpanded ? 'expanded' : ''} size={18} aria-hidden />
              </button>
              {historyExpanded ? (
                historyLoading ? (
                  <div className="fund-manager-empty">加载历史净值中...</div>
                ) : historyRows.length > 0 ? (
                  <div className="fund-manager-history-table">
                    <div className="fund-manager-history-row fund-manager-table-head">
                      <span>日期</span>
                      <span>单位净值</span>
                      <span>累计净值</span>
                      <span>日涨幅</span>
                    </div>
                    <div className="fund-manager-history-scroll">
                      {historyRows.slice(0, historyVisibleCount).map((item) => (
                        <div className="fund-manager-history-row" key={item.date}>
                          <span>{item.date}</span>
                          <span>{formatNav(item.unitNetValue)}</span>
                          <span>{formatNav(item.accumulatedNetValue)}</span>
                          <strong className={getDeltaClass(item.dailyChange)}>{formatPercent(item.dailyChange)}</strong>
                        </div>
                      ))}
                      {historyRows.length > historyVisibleCount ? (
                        <button
                          type="button"
                          className="fund-manager-load-more"
                          onClick={() => setHistoryVisibleCount((count) => count + 100)}
                        >
                          加载更多
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <div className="fund-manager-empty">{historyError ? '历史净值加载失败' : '暂无历史净值'}</div>
                )
              ) : null}
            </section>
          </div>
        </main>

        <footer className="fund-manager-detail-footer">数据仅供参考，不构成投资建议</footer>
      </DialogContent>
    </Dialog>
  );
}
