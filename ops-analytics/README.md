# 估基运营统计服务

轻量自托管统计服务，接收主站同源 `/api/analytics/track` 埋点。独立子域名部署时，管理台可直接通过根路径访问。

## 环境变量

- `ADMIN_USERNAME`：管理台管理员账号，必填。
- `ADMIN_PASSWORD`：管理台管理员密码，必填。账号与密码只保存在服务器环境变量中。
- `ANALYTICS_SALT`：IP 哈希盐值，建议生产环境固定为随机长字符串。
- `SUPABASE_URL` 或 `NEXT_PUBLIC_SUPABASE_URL`：Supabase 项目地址。
- `SUPABASE_SERVICE_ROLE_KEY`：Supabase service role key，用于统计 Auth 邮箱注册用户数，并在管理员登录后分页读取邮箱列表。该密钥只配置在运营统计服务端，不能放入前端或公开环境变量。
- `DB_PATH`：SQLite 文件路径，默认 `/data/analytics.sqlite3`。
- `STATS_TZ`：统计时区，默认 `Asia/Shanghai`。
- `PORT`：服务端口，默认 `8787`。
- `GEOIP_DB_PATH`：本地城市级 IP 库路径，默认 `/data/geoip/DBIP-City-Lite.mmdb`。配置后，运营台会显示近 7 日的访问地图；服务只短暂读取请求 IP 进行本地查库，不保存明文 IP。

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

## 访问地图

运营台地图使用本地 GeoIP 城市库。推荐使用 [DB-IP Lite](https://db-ip.com/db/download/ip-to-city-lite) 的 MMDB 文件并挂载到 `/data/geoip/DBIP-City-Lite.mmdb`。服务仅保存 IP 哈希、国家/城市名称和精度约 0.1 度的聚合坐标；地图按地点汇总显示 PV、UV 和独立 IP 数，不显示原始 IP。

## 管理台数据

管理员登录后，运营台会显示 Supabase Auth 中的邮箱注册客户，并通过“上一页 / 下一页”按页请求。页面来源分析按最近 7 天或 30 天统计 PV、UV、来源渠道、来源域名和主要落地页；来源 URL 的查询参数不会返回到管理台。
