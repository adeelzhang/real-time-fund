# 估基运营统计服务

轻量自托管统计服务，接收主站同源 `/api/analytics/track` 埋点。独立子域名部署时，管理台可直接通过根路径访问。

## 环境变量

- `ADMIN_PASSWORD`：管理台管理员密码，必填。密码只保存在服务器环境变量中。
- `ANALYTICS_SALT`：IP 哈希盐值，建议生产环境固定为随机长字符串。
- `DB_PATH`：SQLite 文件路径，默认 `/data/analytics.sqlite3`。
- `STATS_TZ`：统计时区，默认 `Asia/Shanghai`。
- `PORT`：服务端口，默认 `8787`。

## 本地运行

```bash
ADMIN_PASSWORD=change-me python server.py
```

## Docker

```bash
docker build -t guji-analytics .
docker run -d --name guji-analytics \
  -e ADMIN_PASSWORD=change-me \
  -e ANALYTICS_SALT=random-salt \
  -v /opt/guji-analytics/data:/data \
  -p 8787:8787 \
  guji-analytics
```
