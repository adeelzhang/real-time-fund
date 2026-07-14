import Link from 'next/link';
import { SITE_INFO_UPDATED_ISO, SITE_NAME, SITE_URL } from '@/app/lib/site';

const UPDATED_LABEL = '2026年7月15日';

export function InfoSection({ title, children, id }) {
  return (
    <section className="info-section" aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      {children}
    </section>
  );
}

export function InfoNote({ title, children }) {
  return (
    <aside className="info-note">
      {title ? <strong>{title}</strong> : null}
      <div>{children}</div>
    </aside>
  );
}

export default function InfoArticle({ label, title, description, path, schemaType = 'WebPage', children }) {
  const absoluteUrl = `${SITE_URL}${path}`;
  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': schemaType,
        name: title,
        description,
        url: absoluteUrl,
        inLanguage: 'zh-CN',
        dateModified: SITE_INFO_UPDATED_ISO,
        isPartOf: {
          '@type': 'WebSite',
          name: SITE_NAME,
          url: SITE_URL
        }
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: '估基首页',
            item: SITE_URL
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: title,
            item: absoluteUrl
          }
        ]
      }
    ]
  };

  return (
    <main id="main-content" className="info-main">
      <nav className="info-breadcrumb" aria-label="面包屑">
        <Link href="/">首页</Link>
        <span aria-hidden>/</span>
        <span aria-current="page">{label}</span>
      </nav>

      <article className="info-article">
        <header className="info-article-header">
          <p className="info-kicker">{label}</p>
          <h1>{title}</h1>
          <p className="info-lead">{description}</p>
          <p className="info-updated">
            更新日期：<time dateTime={SITE_INFO_UPDATED_ISO}>{UPDATED_LABEL}</time>
          </p>
        </header>
        {children}
      </article>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, '\\u003c') }}
      />
    </main>
  );
}
