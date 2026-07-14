'use client';

import { useStorageStore } from '../stores';
import { useFundManagerIntraday } from '../hooks/useFundManagerIntraday';
import FundCard from './FundCard';

export default function ClassicFundDetailCard({ row, getFundCardProps, layoutMode = 'drawer' }) {
  const funds = useStorageStore((state) => state.funds);
  const cardProps = row && getFundCardProps ? getFundCardProps(row) : null;
  const fallbackFund = cardProps?.fallbackFund || row?.rawFund || row || {};
  const fundCode = fallbackFund.code || row?.code || '';
  const fund = funds?.find((item) => item.code === fundCode) || fallbackFund;
  const referenceNav = Number(fund?.dwjz);
  const managerHoldingsData = useFundManagerIntraday(fundCode, Number.isFinite(referenceNav) ? referenceNav : null);

  if (!cardProps) return null;

  return (
    <FundCard
      {...cardProps}
      layoutMode={layoutMode}
      intradaySeriesOverride={managerHoldingsData.series}
      managerHoldingsData={managerHoldingsData}
    />
  );
}
