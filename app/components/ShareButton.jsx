'use client';

import { Share2 } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const MAIN_SITE_URL = 'https://www.myfunds.cc/';

async function copyShareUrl() {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(MAIN_SITE_URL);
    return;
  }

  const input = document.createElement('textarea');
  input.value = MAIN_SITE_URL;
  input.style.position = 'fixed';
  input.style.opacity = '0';
  document.body.appendChild(input);
  input.select();
  document.execCommand('copy');
  input.remove();
}

export default function ShareButton({ onNotify }) {
  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: '估基', url: MAIN_SITE_URL });
        return;
      }

      await copyShareUrl();
      onNotify?.('主站链接已复制', 'success');
    } catch (error) {
      if (error?.name === 'AbortError') return;
      try {
        await copyShareUrl();
        onNotify?.('主站链接已复制', 'success');
      } catch {
        onNotify?.('分享失败，请稍后重试', 'error');
      }
    }
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="icon-button" aria-label="分享估基" onClick={handleShare}>
          <Share2 width={18} height={18} aria-hidden />
        </button>
      </TooltipTrigger>
      <TooltipContent>
        <p>分享</p>
      </TooltipContent>
    </Tooltip>
  );
}
