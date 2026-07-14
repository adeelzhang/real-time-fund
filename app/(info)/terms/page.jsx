import Link from 'next/link';
import InfoArticle, { InfoNote, InfoSection } from '../_components/InfoArticle';
import { createInfoMetadata } from '@/app/lib/site';

const title = '估基用户协议';
const description = '说明使用估基基金估值、持仓管理、邮箱登录和云端同步服务时应遵守的规则及双方责任边界。';

export const metadata = createInfoMetadata({
  title,
  description,
  path: '/terms'
});

export default function TermsPage() {
  return (
    <InfoArticle label="用户协议" title={title} description={description} path="/terms">
      <InfoSection title="协议接受" id="acceptance">
        <p>
          访问或使用估基即表示你已阅读并理解本协议、<Link href="/privacy">隐私政策</Link>和
          <Link href="/risk-disclosure">风险提示</Link>。不同意相关内容时，请停止使用对应服务。
        </p>
      </InfoSection>

      <InfoSection title="服务内容" id="service">
        <p>
          估基提供基金搜索、估值参考、净值与持仓信息展示、个人持仓记录、收益计算、行情查看、数据导入导出、邮箱登录和云端同步等信息工具。
        </p>
        <p>估基不是基金销售机构、证券交易平台或投资顾问，不接受交易委托，也不保管用户投资资金。</p>
      </InfoSection>

      <InfoSection title="账号与设备安全" id="account-security">
        <ul>
          <li>用户应使用本人可控制的邮箱接收登录验证码，并妥善保护邮箱和设备。</li>
          <li>不得转发验证码、共享登录会话或利用他人账号访问云端数据。</li>
          <li>发现异常登录或数据变化时，应及时退出账号并检查邮箱与设备安全。</li>
          <li>在公共设备使用后，应退出登录并清理浏览器保存的数据。</li>
        </ul>
      </InfoSection>

      <InfoSection title="合理使用" id="acceptable-use">
        <p>用户不得以影响服务稳定性、数据来源或其他用户的方式使用估基，包括但不限于：</p>
        <ul>
          <li>绕过登录鉴权、访问频率限制或其他安全措施。</li>
          <li>对接口进行高频自动抓取、批量攻击、恶意扫描或资源耗尽。</li>
          <li>上传恶意内容，干扰页面、服务器、数据库或云端同步。</li>
          <li>违反法律法规、第三方数据规则或侵害他人合法权益。</li>
        </ul>
      </InfoSection>

      <InfoSection title="用户数据" id="user-data">
        <p>
          用户对自行录入的持仓与交易信息负责。估基根据用户操作在本地或云端保存相关配置，但不保证因设备清理、网络故障、上游服务变化或不可抗力造成的数据能够恢复。
        </p>
        <p>建议定期使用数据导出功能备份重要记录，并妥善保管导出文件。</p>
      </InfoSection>

      <InfoSection title="数据与知识产权" id="data-rights">
        <p>
          估基的页面设计、程序和自有内容受适用法律保护。基金名称、净值、行情和持仓等第三方数据的权利归相应权利人所有，用户应遵守数据提供方的使用规则。
        </p>
      </InfoSection>

      <InfoSection title="服务变更与可用性" id="availability">
        <p>
          为修复问题、提高安全性、适配数据源或遵守监管要求，估基可能调整功能、接口和存储方式。网络维护、上游故障或不可抗力可能造成部分服务暂时不可用。
        </p>
      </InfoSection>

      <InfoSection title="投资风险与责任边界" id="risk-and-liability">
        <p>
          用户应独立核对数据并承担投资决策结果。估值、排行、走势和收益计算不构成收益承诺或投资建议。在法律允许范围内，估基不对依赖页面参考信息形成的投资损失承担责任。
        </p>
        <InfoNote title="最终信息来源">
          <p>基金交易、份额、资产和收益均应以基金管理人或销售机构正式记录为准。</p>
        </InfoNote>
      </InfoSection>

      <InfoSection title="协议更新" id="terms-updates">
        <p>
          本协议可能随功能、法律法规或服务方式变化而更新。更新后的版本将在本页展示新的更新日期，继续使用相关服务视为接受更新后的内容。
        </p>
      </InfoSection>
    </InfoArticle>
  );
}
