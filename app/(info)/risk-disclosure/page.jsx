import Link from 'next/link';
import InfoArticle, { InfoNote, InfoSection } from '../_components/InfoArticle';
import { createInfoMetadata } from '@/app/lib/site';

const title = '风险提示与免责声明';
const description = '阅读基金估值、净值、持仓、行情和收益计算的主要风险，了解估基信息服务的使用边界。';

export const metadata = createInfoMetadata({
  title: '基金估值风险提示与免责声明 - 估基',
  description,
  path: '/risk-disclosure'
});

export default function RiskDisclosurePage() {
  return (
    <InfoArticle label="风险提示" title={title} description={description} path="/risk-disclosure">
      <InfoSection title="估值不等于净值" id="valuation-risk">
        <p>
          页面展示的实时估值是基于公开持仓和市场行情形成的推算结果，不是基金管理人确认的单位净值。基金实际调仓、费用计提、现金仓位、债券估值、衍生品、汇率及跨市场时差都可能导致明显偏差。
        </p>
      </InfoSection>

      <InfoSection title="数据可能延迟或缺失" id="data-risk">
        <p>
          基金净值、持仓、证券行情和全球市场数据来自公开网络服务，可能出现延迟、错误、暂停、字段变化或访问中断。页面的缓存或备用结果也可能不是当前时点的最新信息。
        </p>
      </InfoSection>

      <InfoSection title="持仓披露具有滞后性" id="holding-risk">
        <p>
          前十大持仓主要来自基金定期报告，只反映报告期末的部分资产。基金经理可能在披露后调整仓位，因此持仓走势不能完整代表基金当日表现，也不能作为预测基金净值的唯一依据。
        </p>
      </InfoSection>

      <InfoSection title="个人收益依赖录入数据" id="personal-data-risk">
        <p>
          持仓金额、今日收益和累计收益依赖用户录入的份额、成本、交易和分红方式。未记录手续费、确认份额、历史交易或分红信息会造成误差。最终资产与收益应以基金管理人或销售机构账单为准。
        </p>
      </InfoSection>

      <InfoSection title="不构成投资建议" id="not-advice">
        <p>
          估基不提供基金销售、交易执行、组合推荐、收益保证或针对个人情况的投资顾问服务。任何排名、涨跌、走势、估值和持仓展示都不代表买入、持有或卖出建议。
        </p>
        <p>基金投资可能发生本金损失，历史表现不代表未来收益。用户应根据自身情况独立判断，并阅读基金正式法律文件。</p>
      </InfoSection>

      <InfoSection title="责任边界" id="liability">
        <p>
          在法律允许的范围内，因数据延迟、上游服务变化、网络中断、用户录入错误或依据页面信息作出的投资决策所产生的损失，估基不承担投资结果责任。该说明不排除法律法规规定不得限制或免除的责任。
        </p>
        <InfoNote title="使用即代表知悉">
          <p>
            继续使用估基前，请同时阅读<Link href="/methodology">计算说明</Link>、
            <Link href="/data-sources">数据来源</Link>和<Link href="/terms">用户协议</Link>。
          </p>
        </InfoNote>
      </InfoSection>
    </InfoArticle>
  );
}
