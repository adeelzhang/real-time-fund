import Link from 'next/link';
import InfoArticle, { InfoNote, InfoSection } from '../_components/InfoArticle';
import { createInfoMetadata } from '@/app/lib/site';

const title = '关于估基';
const description = '了解估基的产品定位、主要能力、数据原则以及基金估值工具的使用边界。';

export const metadata = createInfoMetadata({
  title: '关于估基 - 实时基金估值与持仓管理工具',
  description,
  path: '/about'
});

export default function AboutPage() {
  return (
    <InfoArticle label="关于我们" title={title} description={description} path="/about" schemaType="AboutPage">
      <InfoSection title="估基是什么" id="what-is-guji">
        <p>
          估基是一款面向网页端和移动端的基金估值与持仓管理工具。它把基金搜索、实时估值参考、日内走势、历史净值、前十大持仓、收益记录和全球行情整理在同一个界面中，帮助用户更高效地查看自己关注的基金。
        </p>
        <p>估基不提供基金交易、开户、代销或投资顾问服务。页面中的估值、行情与收益计算仅用于信息整理和个人参考。</p>
      </InfoSection>

      <InfoSection title="主要能力" id="capabilities">
        <ul>
          <li>按基金名称或代码搜索并建立自选基金列表。</li>
          <li>查看交易时段内的基金估值参考、日内走势与最近净值。</li>
          <li>查看基金历史表现、前十大持仓及相关证券走势。</li>
          <li>记录份额、成本、交易和分红方式，计算持仓金额与收益。</li>
          <li>使用分组、表格和卡片视图管理不同投资账户或关注清单。</li>
          <li>登录后在不同设备间同步持仓与显示设置。</li>
        </ul>
      </InfoSection>

      <InfoSection title="产品原则" id="principles">
        <h3>本地优先</h3>
        <p>未登录时，基金清单、持仓和偏好默认保存在当前浏览器。登录后才会启用云端同步。</p>
        <h3>透明说明</h3>
        <p>
          估值数据可能延迟、缺失或与最终净值存在差异。我们通过
          <Link href="/methodology">计算说明</Link>、<Link href="/data-sources">数据来源</Link>和
          <Link href="/risk-disclosure">风险提示</Link>公开主要口径与限制。
        </p>
        <h3>自有统计</h3>
        <p>访问统计仅发送到估基自有服务器，不接入第三方统计、错误上报、外部社群或开源项目入口。</p>
      </InfoSection>

      <InfoSection title="使用边界" id="boundaries">
        <p>
          基金净值由基金管理人及相关机构最终确认，估基无法替代基金合同、招募说明书、定期报告、管理人公告或销售机构提供的正式信息。进行任何投资决策前，请核对权威来源并独立判断风险。
        </p>
        <InfoNote title="重要提示">
          <p>估基展示的估算数据不构成收益承诺、交易信号或针对任何人的投资建议。</p>
        </InfoNote>
      </InfoSection>
    </InfoArticle>
  );
}
