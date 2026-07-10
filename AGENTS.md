# 估基开发说明

估基是一个基金估值与持仓管理 Web 应用。

## 技术栈

- Next.js App Router
- JavaScript/JSX
- 静态导出
- Supabase 邮箱 OTP 登录与云端同步
- 自有 `ops-analytics` 访问统计服务

## 约束

- 不接入第三方统计、反馈或错误上报服务。
- 不添加外部支持、社交群组或开源项目入口。
- 用户访问统计只允许发送到同源 `/api/analytics/track`，由自有服务器处理。

## 常用命令

```bash
npm run dev
npm run lint
npm run build -- --webpack
```
