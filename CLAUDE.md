# 估基项目说明

估基是一个 Next.js App Router 项目，使用纯 JavaScript/JSX 和静态导出部署。

## 常用命令

```bash
npm run dev
npm run lint
npm run build -- --webpack
```

## 数据边界

- 基金行情数据来自公开基金与行情接口。
- 用户持仓默认保存在浏览器本地，配置 Supabase 后支持邮箱验证码登录与云端同步。
- 访问统计只允许进入自有 `ops-analytics` 服务，不接入第三方统计、反馈或错误上报服务。
