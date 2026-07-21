import Link from 'next/link';
import InfoArticle, { InfoNote, InfoSection } from '../_components/InfoArticle';
import { createInfoMetadata } from '@/app/lib/site';

const title = '估基隐私政策';
const description = '说明估基如何处理浏览器本地数据、邮箱登录信息、云端持仓配置、自有访问统计和第三方行情请求。';

export const metadata = createInfoMetadata({
  title,
  description,
  path: '/privacy'
});

export default function PrivacyPage() {
  return (
    <InfoArticle label="隐私政策" title={title} description={description} path="/privacy">
      <InfoSection title="适用范围" id="scope">
        <p>
          本政策适用于用户访问和使用估基主站、添加到主屏幕后的网页应用，以及与账号登录、云端同步和自有访问统计相关的服务。
        </p>
      </InfoSection>

      <InfoSection title="浏览器本地数据" id="local-data">
        <p>
          未登录时，基金清单、分组、份额、成本、交易记录、分红方式、估值时间序列、显示偏好和安装引导状态主要保存在当前浏览器的本地存储中。估基不会因为你仅在本地记录持仓，就自动把完整持仓发送到云端。
        </p>
        <p>清理浏览器数据、卸载快捷方式或更换设备可能删除这些内容。你可以通过设置中的数据导出功能自行备份。</p>
      </InfoSection>

      <InfoSection title="账号与云端同步" id="account-sync">
        <p>
          使用邮箱验证码注册或登录时，邮箱地址、账号标识、登录会话及必要的验证信息由估基配置的 Supabase
          认证服务处理。登录后，基金清单、持仓、分组、交易记录和偏好设置可保存到与账号关联的云端配置中。
        </p>
        <p>同步会比较本地和远端更新时间，并优先使用较新的版本。退出登录后，本机已有数据通常仍会保留。</p>
      </InfoSection>

      <InfoSection title="自有访问统计" id="first-party-analytics">
        <p>
          为了解访问趋势和服务稳定性，估基向同源自有服务器发送页面访问与活跃事件。记录可能包括随机访客标识、会话标识、访问路径、来源页面、页面标题、浏览器标识、屏幕尺寸、时区和事件时间。
        </p>
        <p>
          如果用户通过带有 UTM
          参数的推广链接访问，服务器还会记录来源、媒介、活动、内容和关键词等渠道归因字段，用于比较不同推广渠道的访问效果。渠道归因信息主要保存在当前浏览器
          90 天，新的推广链接会更新归因。
        </p>
        <p>
          服务器会读取请求 IP 用于生成加盐哈希值，不保存原始
          IP。该统计不使用第三方分析平台，也不包含用户录入的具体持仓金额。
        </p>
      </InfoSection>

      <InfoSection title="第三方数据请求" id="third-party-requests">
        <p>
          为展示基金与行情信息，浏览器或估基服务器可能请求东方财富、天天基金、新浪财经、腾讯行情及 Supabase
          等服务。相关服务会按其规则接收网络请求中必要的 IP、浏览器和请求参数信息。
        </p>
        <p>估基不会向这些行情来源主动发送用户的完整持仓清单，但基金代码等查询参数可能包含在数据请求中。</p>
      </InfoSection>

      <InfoSection title="数据安全与保存" id="security-retention">
        <p>
          估基通过
          HTTPS、访问鉴权、服务端密钥隔离和最小化统计字段降低数据风险。任何网络服务都无法保证绝对安全，用户应保护邮箱账号、验证码、导出文件和使用设备。
        </p>
        <p>
          本地数据由用户的浏览器保存；云端配置和账号数据在提供同步服务所需期间保存；访问统计按运营分析和安全需要保存，并可根据存储压力进行清理或汇总。
        </p>
      </InfoSection>

      <InfoSection title="用户选择" id="choices">
        <ul>
          <li>可以不登录，仅使用浏览器本地模式。</li>
          <li>可以在设置中导出数据，并删除单只基金、持仓或分组记录。</li>
          <li>可以退出登录，停止当前设备继续自动同步。</li>
          <li>可以通过浏览器设置清除站点本地存储和访客标识。</li>
        </ul>
        <InfoNote title="敏感信息提醒">
          <p>
            持仓和交易记录属于个人财务相关信息。请勿在公共设备保存敏感数据，也不要把导出文件交给无关人员。更多使用约定见
            <Link href="/terms">用户协议</Link>。
          </p>
        </InfoNote>
      </InfoSection>

      <InfoSection title="政策更新" id="policy-updates">
        <p>
          当登录、同步、统计或数据服务方式发生重要变化时，本政策会更新日期和相关说明。继续使用前，请关注本页最新版本。
        </p>
      </InfoSection>
    </InfoArticle>
  );
}
