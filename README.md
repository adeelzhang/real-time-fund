# 估基

估基是一个面向网页端和移动端的基金估值与持仓管理工具。主站使用 Next.js 静态导出部署，持仓与配置默认保存在本机，配置 Supabase 后可支持邮箱验证码登录和云端同步。

## 功能

- 实时基金估值、净值、涨跌幅展示
- 前十大重仓与关联行情追踪
- 自选、分组、持仓、交易记录、定投计划
- 本地导入/导出备份
- 明暗主题、移动端适配、PWA 桌面快捷方式
- 自有运营统计：PV、UV、实时客户量、7 日与月度趋势

## 本地开发

```bash
npm install
cp env.example .env.local
npm run dev
```

访问 `http://localhost:3000`。

## 环境变量

```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

Supabase 未配置时，应用仍可作为本地持仓工具使用；登录与云端同步不可用。

## 构建

```bash
npm run build -- --webpack
```

构建产物位于 `out/`，可用 Nginx、Caddy 或任意静态服务部署。

## Docker

```bash
docker build -t guji .
docker run -d --name guji -p 3000:3000 --restart unless-stopped guji
```

## 运营管理台

运营统计服务位于 `ops-analytics/`，用于接收主站同源埋点并提供 `/ops` 管理台。

主站会向 `/api/analytics/track` 发送匿名访问事件。服务端只保存匿名访客 ID、会话 ID、路径、来源、UA、IP 哈希与时间戳，不发送到第三方统计服务。
