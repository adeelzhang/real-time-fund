import Link from 'next/link';
import { INFO_LINKS } from '@/app/lib/site';
import InfoNavigation from './_components/InfoNavigation';
import './info.css';

export default function InfoLayout({ children }) {
  return (
    <div className="info-shell">
      <a className="info-skip-link" href="#main-content">
        跳到正文
      </a>
      <InfoNavigation />

      {children}

      <footer className="info-site-footer">
        <div className="info-site-footer-inner">
          <nav className="info-footer-links" aria-label="站点信息">
            {INFO_LINKS.map((item) => (
              <Link key={item.href} href={item.href}>
                {item.label}
              </Link>
            ))}
          </nav>
          <p>估值和行情信息仅供参考，不构成任何投资建议。</p>
        </div>
      </footer>
    </div>
  );
}
