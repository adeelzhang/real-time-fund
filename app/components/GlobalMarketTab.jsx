'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Globe2, LockKeyhole, RefreshCw } from 'lucide-react';
import { fetchGlobalQuotes } from '../api/fund';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';

const GLOBAL_MARKET_SECTIONS = [
  { id: 'aStock', title: 'A股指数' },
  { id: 'global', title: '全球市场', note: '“ETF代理”品种并非指数现货' },
  { id: 'commodity', title: '商品相关 ETF' }
];

const formatNumber = (value, digits = 2) => {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(digits) : '--';
};

const formatSigned = (value, suffix = '') => {
  const number = Number(value);
  if (!Number.isFinite(number)) return `--${suffix}`;
  return `${number > 0 ? '+' : ''}${number.toFixed(2)}${suffix}`;
};

const formatLarge = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number === 0) return '--';
  if (Math.abs(number) >= 100000000) return `${(number / 100000000).toFixed(2)}亿`;
  if (Math.abs(number) >= 10000) return `${(number / 10000).toFixed(2)}万`;
  return number.toFixed(0);
};

const getDeltaClass = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number === 0) return '';
  return number > 0 ? 'up' : 'down';
};

const getUpdatedTime = (value) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '--:--';
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
};

function QuoteDetailDialog({ quote, onOpenChange }) {
  const detailRows = useMemo(
    () =>
      quote
        ? [
            ['今开', formatNumber(quote.open)],
            ['最高', formatNumber(quote.high)],
            ['最低', formatNumber(quote.low)],
            ['昨收', formatNumber(quote.preClose)],
            ['成交量', formatLarge(quote.volume)],
            ['成交额', formatLarge(quote.amount)],
            ['代码', quote.code || '--'],
            ['更新时间', quote.updateTime || '--']
          ]
        : [],
    [quote]
  );

  return (
    <Dialog open={Boolean(quote)} onOpenChange={onOpenChange}>
      <DialogContent className="global-quote-dialog glass sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{quote?.name || '行情详情'}</DialogTitle>
        </DialogHeader>
        {quote ? (
          <div className="global-quote-detail">
            <div className="global-quote-detail-meta">
              <span>{quote.code}</span>
              <span>{quote.type}</span>
            </div>
            <strong className={`global-quote-detail-price ${getDeltaClass(quote.pct)}`}>
              {formatNumber(quote.price)}
            </strong>
            <div className={`global-quote-detail-change ${getDeltaClass(quote.pct)}`}>
              {formatSigned(quote.change)} {formatSigned(quote.pct, '%')}
            </div>
            <div className="global-quote-detail-grid">
              {detailRows.map(([label, value]) => (
                <div key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export default function GlobalMarketTab({ isActive, user, onLogin }) {
  const [selectedQuote, setSelectedQuote] = useState(null);
  const { data, isPending, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['global-market-quotes'],
    queryFn: fetchGlobalQuotes,
    enabled: Boolean(isActive && user),
    staleTime: 15 * 1000,
    refetchInterval: isActive && user ? 30 * 1000 : false,
    refetchOnWindowFocus: false,
    retry: 1
  });

  if (!user) {
    return (
      <div className="global-market-tab">
        <div className="global-market-auth glass">
          <LockKeyhole size={22} aria-hidden />
          <strong>需要登录解锁全球行情</strong>
          <button type="button" className="button" onClick={onLogin}>
            登录
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="global-market-tab">
      <header className="global-market-header">
        <div className="global-market-title-row">
          <Globe2 size={20} aria-hidden />
          <h1>全球行情</h1>
          {data?.isAStockTrading ? (
            <span className="global-market-live">
              <i /> LIVE
            </span>
          ) : null}
        </div>
        <button
          type="button"
          className="icon-button global-market-refresh"
          aria-label="刷新全球行情"
          title="刷新"
          disabled={isFetching}
          onClick={() => refetch()}
        >
          <RefreshCw size={17} className={isFetching ? 'is-spinning' : ''} aria-hidden />
        </button>
      </header>

      {isPending ? (
        <div className="global-market-loading-sections" aria-label="正在加载全球行情">
          {GLOBAL_MARKET_SECTIONS.map((section) => (
            <section className="global-market-section" key={section.id}>
              <div className="global-market-section-heading">
                <h2>{section.title}</h2>
                {section.note ? <span>{section.note}</span> : null}
              </div>
              <div className="global-quote-grid">
                {Array.from({ length: 9 }).map((_, index) => (
                  <div className="global-quote-card global-quote-card-skeleton" key={index}>
                    <Skeleton className="global-quote-skeleton-name" />
                    <Skeleton className="global-quote-skeleton-price" />
                    <Skeleton className="global-quote-skeleton-change" />
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : isError ? (
        <div className="global-market-error glass" role="alert">
          <span>{error?.message || '全球行情暂时无法获取'}</span>
          <button type="button" className="button" onClick={() => refetch()}>
            重新加载
          </button>
        </div>
      ) : (
        <>
          {(data?.groups || []).map((group) => (
            <section className="global-market-section" key={group.id}>
              <div className="global-market-section-heading">
                <h2>{group.title}</h2>
                {group.id === 'global' ? <span>“ETF代理”品种并非指数现货</span> : null}
              </div>
              <div className="global-quote-grid">
                {(group.items || []).map((quote) => (
                  <button
                    type="button"
                    className={`global-quote-card ${getDeltaClass(quote.pct)}`}
                    key={quote.code}
                    onClick={() => setSelectedQuote(quote)}
                    aria-label={`查看${quote.name}行情详情`}
                  >
                    <span className="global-quote-name">{quote.name}</span>
                    <strong>{formatNumber(quote.price)}</strong>
                    <span className={getDeltaClass(quote.pct)}>{formatSigned(quote.pct, '%')}</span>
                  </button>
                ))}
              </div>
            </section>
          ))}
          <footer className="global-market-footer">更新于 {getUpdatedTime(data?.updatedAt)}</footer>
        </>
      )}

      <QuoteDetailDialog quote={selectedQuote} onOpenChange={(open) => !open && setSelectedQuote(null)} />
    </div>
  );
}
