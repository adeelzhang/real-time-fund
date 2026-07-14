import Link from 'next/link';
import InfoArticle, { InfoNote, InfoSection } from '../_components/InfoArticle';
import { createInfoMetadata } from '@/app/lib/site';

const title = '估基常见问题';
const description = '解答基金搜索、实时估值、持仓记录、云端同步、数据导入导出和添加到主屏幕等常见问题。';

export const metadata = createInfoMetadata({
  title: '估基常见问题 - 基金估值与持仓管理',
  description,
  path: '/help'
});

export default function HelpPage() {
  return (
    <InfoArticle label="使用帮助" title={title} description={description} path="/help">
      <InfoSection title="不登录可以使用吗？" id="use-without-login">
        <p>
          可以。未登录时，基金清单、分组、持仓和显示设置默认保存在当前浏览器中。清理浏览器数据、更换设备或使用无痕模式可能导致这些本地数据无法恢复，建议定期在设置中导出配置备份。
        </p>
      </InfoSection>

      <InfoSection title="登录后会同步哪些内容？" id="cloud-sync">
        <p>
          邮箱验证码登录后，基金清单、分组、持仓、交易记录和主要显示设置会同步到云端。系统比较本地与远端时间戳并使用较新的版本；登录状态下发生新增、修改或删除时会自动同步。
        </p>
      </InfoSection>

      <InfoSection title="实时估值为什么与最终净值不同？" id="valuation-difference">
        <p>
          实时估值是根据已披露持仓和证券行情推算的参考值，不是基金管理人确认的净值。基金调仓、持仓披露滞后、费用、汇率、跨市场时差和非股票资产都会造成差异。请查看
          <Link href="/methodology">计算说明</Link>了解具体口径。
        </p>
      </InfoSection>

      <InfoSection title="搜索代码有结果，搜索名称没有结果怎么办？" id="search-fund">
        <p>
          可以先使用六位基金代码搜索。中文名称搜索会同时使用本地基金列表和在线搜索接口；当上游接口暂时不可用时，名称结果可能不完整，稍后刷新基金数据后可再次尝试。
        </p>
      </InfoSection>

      <InfoSection title="行情或估值暂时没有数据怎么办？" id="missing-data">
        <p>
          先确认是否为交易日和对应市场交易时间，再检查页面显示的更新时间。网络波动、上游限流或数据源维护可能造成短暂空白，可以稍后刷新。历史净值和持仓披露并不按交易时段实时更新。
        </p>
      </InfoSection>

      <InfoSection title="如何记录持仓和收益？" id="record-holdings">
        <p>
          添加基金后，可在基金列表或详情页进入持仓操作，录入份额、单位成本、交易日期和分红方式。今日收益和累计收益依赖这些输入；遗漏交易、手续费或历史分红会影响结果。
        </p>
      </InfoSection>

      <InfoSection title="如何备份或迁移数据？" id="backup-data">
        <p>
          在“我的 - 设置 -
          数据导出”中导出配置文件，并在新设备使用“数据导入”。导出的文件包含个人持仓信息，请妥善保管，不要上传到公开位置或发送给不可信人员。
        </p>
      </InfoSection>

      <InfoSection title="如何添加到手机主屏幕？" id="install-pwa">
        <p>
          在“我的”中选择“添加到主屏幕”。iOS 需要使用 Safari 的共享菜单选择“添加到主屏幕”；Android 可通过 Chrome
          或系统浏览器的“安装应用”“添加到主屏幕”完成。
        </p>
        <InfoNote title="仍需帮助？">
          <p>
            使用前建议同时阅读<Link href="/data-sources">数据来源</Link>和<Link href="/risk-disclosure">风险提示</Link>
            ，确认当前数据是否适合你的查看场景。
          </p>
        </InfoNote>
      </InfoSection>
    </InfoArticle>
  );
}
