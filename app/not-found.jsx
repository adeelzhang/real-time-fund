import Image from 'next/image';
import Link from 'next/link';

export const metadata = {
  title: '页面不存在 - 估基',
  robots: {
    index: false,
    follow: false
  }
};

export default function NotFound() {
  return (
    <main className="not-found-page">
      <Image src="/guji-icon-192-v2.png" alt="估基" width={72} height={72} unoptimized priority />
      <p className="not-found-code">404</p>
      <h1>页面不存在</h1>
      <p>你访问的地址可能已变更，或从未存在。</p>
      <Link href="/">返回估基首页</Link>
    </main>
  );
}
