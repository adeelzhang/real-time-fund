'use client';

import { ChevronLeft } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useModalStore } from '../stores';
import FundCard from './FundCard';

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

export default function FundManagerDetail({ row, getFundCardProps, onClose, blockClose = false }) {
  const isAnySubModalOpen = useModalStore(selectSubModalOpen);
  const finalBlockClose = blockClose || isAnySubModalOpen;
  const cardProps = row && getFundCardProps ? getFundCardProps(row) : null;
  const fund = cardProps?.fallbackFund || row?.rawFund || row || {};
  const fundName = fund.name || fund.fundName || row?.fundName || '基金详情';
  const fundCode = fund.code || row?.code || '';

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
            <ChevronLeft aria-hidden size={22} strokeWidth={2} />
          </button>
          <div className="fund-manager-detail-heading">
            <DialogTitle className="fund-manager-detail-title">{fundName}</DialogTitle>
            {fundCode ? <span className="fund-manager-detail-code">{fundCode}</span> : null}
          </div>
          <span className="fund-manager-detail-header-spacer" aria-hidden />
        </header>

        <main className="fund-manager-detail-body scrollbar-y-styled">
          {cardProps ? <FundCard {...cardProps} layoutMode="manager" /> : null}
        </main>

        <footer className="fund-manager-detail-footer">数据仅供参考，不构成投资建议</footer>
      </DialogContent>
    </Dialog>
  );
}
