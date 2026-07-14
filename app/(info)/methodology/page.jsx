import Link from 'next/link';
import InfoArticle, { InfoNote, InfoSection } from '../_components/InfoArticle';
import { createInfoMetadata } from '@/app/lib/site';

const title = '基金估值与收益计算说明';
const description = '说明估基如何展示基金实时估值、持仓金额、今日收益和累计收益，以及各项结果的适用范围。';

export const metadata = createInfoMetadata({
  title: '基金实时估值与收益计算说明 - 估基',
  description,
  path: '/methodology'
});

export default function MethodologyPage() {
  return (
    <InfoArticle label="计算说明" title={title} description={description} path="/methodology">
      <InfoSection title="实时估值参考" id="valuation-method">
        <p>
          交易时段内，估基根据基金代码选择可用的公开估值数据源，并展示估算净值、估算涨幅和更新时间。常见口径可简化表示为：
        </p>
        <p>
          <strong>估算涨幅 =（估算净值 - 上一已确认单位净值）÷ 上一已确认单位净值 × 100%</strong>
        </p>
        <p>
          不同数据源可能采用不同的持仓样本、证券行情和权重更新周期。估基会优先使用当前可用数据，但不会把估值标记为已经确认的基金净值。
        </p>
      </InfoSection>

      <InfoSection title="持仓金额" id="holding-amount">
        <p>
          持仓金额优先使用最新已确认单位净值计算，基本口径为“有效份额 ×
          已确认单位净值”。有效份额会结合用户记录的交易和分红方式进行调整。
        </p>
        <p>估值变化可用于交易时段内的参考展示，但不会替代基金公司最终确认的份额与资产金额。</p>
      </InfoSection>

      <InfoSection title="今日收益" id="today-profit">
        <p>
          当最新净值已经确认时，今日收益优先按本期单位净值与上一期单位净值之差乘以有效份额计算。净值尚未确认但存在当日估值时，会使用估算涨幅推算今日收益。
        </p>
        <p>
          当日申购、赎回、确认周期、QDII
          时差和节假日都可能影响计算基准。页面会尽量根据交易记录和基金确认周期调整参与计算的份额，但结果仍可能与销售机构账单不同。
        </p>
      </InfoSection>

      <InfoSection title="累计收益" id="total-profit">
        <p>
          累计收益主要根据当前已确认净值、有效份额、用户录入的单位成本和现金分红计算。选择红利再投资时，估基会根据已记录的分红数据调整有效份额；选择现金分红时，已记录的现金分红会计入累计收益。
        </p>
        <p>
          手续费、税费、份额确认差异、未录入交易以及历史分红数据缺失，都可能造成结果偏差。最终收益请以基金管理人或销售机构账单为准。
        </p>
      </InfoSection>

      <InfoSection title="时间与精度" id="time-and-precision">
        <ul>
          <li>估值时间以数据源返回时间和页面显示时间为准，不保证逐秒更新。</li>
          <li>历史净值通常在基金管理人披露后更新，并非交易时段内实时数据。</li>
          <li>页面会进行必要的小数位格式化，显示值可能与内部计算值存在舍入差异。</li>
          <li>跨境基金、商品基金、债券基金和持仓披露较少的基金，估算偏差通常更明显。</li>
        </ul>
        <InfoNote title="核对方式">
          <p>
            发现数据异常时，请先核对页面更新时间、基金净值日期和<Link href="/data-sources">数据来源说明</Link>。
          </p>
        </InfoNote>
      </InfoSection>
    </InfoArticle>
  );
}
