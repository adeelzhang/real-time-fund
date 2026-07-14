'use client';

import FundManagerSparkline from './FundManagerSparkline';

const asNumber = (value) => {
  if (value == null || value === '') return null;
  const parsed = Number(String(value).replace('%', ''));
  return Number.isFinite(parsed) ? parsed : null;
};

const formatPercent = (value, signed = true) => {
  const parsed = asNumber(value);
  if (parsed == null) return '—';
  return `${signed && parsed > 0 ? '+' : ''}${parsed.toFixed(2)}%`;
};

const getDeltaClass = (value) => {
  const parsed = asNumber(value);
  if (parsed == null || parsed === 0) return '';
  return parsed > 0 ? 'up' : 'down';
};

export default function FundHoldingsDetailTable({
  holdingRows = [],
  allocationRows = [],
  stockIntraday = {},
  holdingsLoading = false,
  stockQuoteDate,
  emptyFallback = null
}) {
  return (
    <div className="fund-holdings-detail-table">
      {stockQuoteDate ? <div className="fund-manager-market-note">个股行情日期 {stockQuoteDate}</div> : null}
      {allocationRows.length > 0 ? (
        <div className="fund-manager-allocation-row">
          {allocationRows.map((item) => (
            <span key={item.name}>
              {item.name} <strong>{formatPercent(item.value, false)}</strong>
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
            const stockQuote = stockIntraday[item.code];
            const change = asNumber(stockQuote?.changePct) ?? asNumber(item.change);
            const weight = asNumber(item.weight);
            const stockSeries = stockQuote?.points || [];
            return (
              <div className="fund-manager-holding-row" key={`${item.code || item.name}-${index}`}>
                <span className="fund-manager-holding-name">
                  <strong>{item.name || '—'}</strong>
                  {item.code ? <small>{item.code}</small> : null}
                </span>
                <span className="fund-manager-holding-sparkline">
                  <FundManagerSparkline
                    values={stockSeries.map((point) => point.price)}
                    positive={(asNumber(stockQuote?.changePct) ?? change) >= 0}
                  />
                </span>
                <strong className={getDeltaClass(change)}>{formatPercent(change)}</strong>
                <span className="fund-manager-weight">
                  <strong>{formatPercent(weight, false)}</strong>
                  <i style={{ width: `${Math.min(Math.max(weight || 0, 0) * 5, 100)}%` }} />
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        emptyFallback || <div className="fund-manager-empty">暂无持仓明细</div>
      )}
    </div>
  );
}
