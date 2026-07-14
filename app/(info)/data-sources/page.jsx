import Link from 'next/link';
import InfoArticle, { InfoNote, InfoSection } from '../_components/InfoArticle';
import { createInfoMetadata } from '@/app/lib/site';

const title = '数据来源与更新时间说明';
const description = '了解估基使用的基金与行情公开数据类型、更新时间、可能的延迟以及第三方数据服务边界。';

export const metadata = createInfoMetadata({
  title: '基金数据来源与更新时间说明 - 估基',
  description,
  path: '/data-sources'
});

export default function DataSourcesPage() {
  return (
    <InfoArticle label="数据来源" title={title} description={description} path="/data-sources">
      <InfoSection title="基金与行情数据" id="market-data">
        <p>
          估基通过公开网络接口获取基金名称、代码、单位净值、历史净值、估值参考、基金持仓和证券行情等信息。当前使用的数据服务可能包括东方财富、天天基金、新浪财经和腾讯行情等公开来源。
        </p>
        <p>
          估基与上述数据提供方不存在代理、背书或投资顾问关系。第三方接口、字段和访问规则可能随时调整，届时部分数据可能暂时不可用。
        </p>
      </InfoSection>

      <InfoSection title="不同数据的更新节奏" id="update-frequency">
        <ul>
          <li>基金估值：通常在基金交易时段内更新，具体频率取决于数据源。</li>
          <li>基金净值：在基金管理人披露并被数据源收录后更新。</li>
          <li>前十大持仓：来自基金定期报告，可能明显滞后于基金当前真实持仓。</li>
          <li>股票和指数行情：可能为实时、延迟或代理行情，以页面时间标识为准。</li>
          <li>全球市场：受交易所时区、休市安排和数据源延迟影响。</li>
        </ul>
      </InfoSection>

      <InfoSection title="用户与同步数据" id="user-data">
        <p>
          未登录用户的基金清单、持仓、分组和偏好保存在当前浏览器。用户通过邮箱验证码登录后，相关配置可同步到估基使用的
          Supabase 云端数据服务，以便在不同设备间恢复和更新。
        </p>
        <p>
          云端同步采用时间戳比较本地与远端版本，并优先使用较新的数据。具体数据处理范围见
          <Link href="/privacy">隐私政策</Link>。
        </p>
      </InfoSection>

      <InfoSection title="数据质量与异常" id="data-quality">
        <p>
          网络波动、上游限流、字段变化、节假日、基金确认周期和跨市场时差都可能导致空白、延迟或短暂不一致。估基会在可行范围内使用缓存、备用数据源和最近一次结果维持展示，但不会伪造缺失数据。
        </p>
        <InfoNote title="权威信息优先">
          <p>
            基金净值、持仓和公告应以基金管理人、托管人、交易所或销售机构发布的正式信息为准。详细限制请阅读
            <Link href="/risk-disclosure">风险提示</Link>。
          </p>
        </InfoNote>
      </InfoSection>
    </InfoArticle>
  );
}
