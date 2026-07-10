import hashlib
import json
import hmac
import os
import sqlite3
import time
from datetime import datetime, timedelta, timezone
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib import error as urllib_error
from urllib import request as urllib_request
from urllib.parse import urlencode, urlparse
from zoneinfo import ZoneInfo


DB_PATH = os.environ.get("DB_PATH", "/data/analytics.sqlite3")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "")
ANALYTICS_SALT = os.environ.get("ANALYTICS_SALT", "guji")
STATS_TZ = os.environ.get("STATS_TZ", "Asia/Shanghai")
MAX_BODY = 16 * 1024
MARKET_MAX_BODY = 1024


def now_ts():
    return int(time.time())


def get_tz():
    try:
        return ZoneInfo(STATS_TZ)
    except Exception:
        return timezone(timedelta(hours=8))


def sanitize(value, limit=512):
    if value is None:
        return ""
    value = str(value).replace("\x00", "").strip()
    return value[:limit]


def get_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with get_db() as conn:
        conn.executescript(
            """
            PRAGMA journal_mode=WAL;
            CREATE TABLE IF NOT EXISTS events (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              ts INTEGER NOT NULL,
              event_type TEXT NOT NULL,
              visitor_id TEXT NOT NULL,
              session_id TEXT NOT NULL,
              path TEXT NOT NULL,
              referrer TEXT,
              title TEXT,
              user_agent TEXT,
              ip_hash TEXT,
              screen TEXT,
              tz TEXT
            );
            CREATE TABLE IF NOT EXISTS visitors (
              visitor_id TEXT PRIMARY KEY,
              first_seen INTEGER NOT NULL,
              last_seen INTEGER NOT NULL,
              last_path TEXT,
              user_agent TEXT,
              ip_hash TEXT
            );
            CREATE TABLE IF NOT EXISTS sessions (
              session_id TEXT PRIMARY KEY,
              visitor_id TEXT NOT NULL,
              first_seen INTEGER NOT NULL,
              last_seen INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts);
            CREATE INDEX IF NOT EXISTS idx_events_type_ts ON events(event_type, ts);
            CREATE INDEX IF NOT EXISTS idx_events_visitor_ts ON events(visitor_id, ts);
            CREATE INDEX IF NOT EXISTS idx_visitors_last_seen ON visitors(last_seen);
            CREATE INDEX IF NOT EXISTS idx_sessions_last_seen ON sessions(last_seen);
            """
        )


def ip_hash(raw_ip):
    ip = sanitize(raw_ip, 128)
    if not ip:
        return ""
    return hashlib.sha256(f"{ANALYTICS_SALT}:{ip}".encode("utf-8")).hexdigest()


def json_response(handler, data, status=HTTPStatus.OK):
    body = json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Cache-Control", "no-store")
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type, X-Admin-Password, Authorization, apikey")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def text_response(handler, text, status=HTTPStatus.OK, content_type="text/html; charset=utf-8"):
    body = text.encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", content_type)
    handler.send_header("Cache-Control", "no-store")
    handler.send_header("X-Frame-Options", "DENY")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def head_response(handler, status=HTTPStatus.OK, content_type="text/html; charset=utf-8"):
    handler.send_response(status)
    handler.send_header("Content-Type", content_type)
    handler.send_header("Cache-Control", "no-store")
    handler.send_header("X-Frame-Options", "DENY")
    handler.end_headers()


def is_authorized(handler):
    if not ADMIN_PASSWORD:
        return False
    supplied_password = handler.headers.get("X-Admin-Password", "")
    return hmac.compare_digest(supplied_password, ADMIN_PASSWORD)


def local_midnight(dt):
    return dt.replace(hour=0, minute=0, second=0, microsecond=0)


def to_ts(dt):
    return int(dt.timestamp())


def count_row(conn, sql, params=()):
    row = conn.execute(sql, params).fetchone()
    return int(row[0] or 0)


def metric_for(conn, start_ts, end_ts):
    return {
        "pv": count_row(
            conn,
            "SELECT COUNT(*) FROM events WHERE event_type='pageview' AND ts>=? AND ts<?",
            (start_ts, end_ts),
        ),
        "uv": count_row(
            conn,
            "SELECT COUNT(DISTINCT visitor_id) FROM events WHERE event_type='pageview' AND ts>=? AND ts<?",
            (start_ts, end_ts),
        ),
    }


def hourly_series(conn, end_dt):
    tz = get_tz()
    end_hour = end_dt.replace(minute=0, second=0, microsecond=0)
    start_hour = end_hour - timedelta(hours=23)
    rows = conn.execute(
        """
        SELECT (ts / 3600) * 3600 AS bucket, COUNT(*) AS pv, COUNT(DISTINCT visitor_id) AS uv
        FROM events
        WHERE event_type='pageview' AND ts>=? AND ts<?
        GROUP BY bucket
        """,
        (to_ts(start_hour), to_ts(end_hour + timedelta(hours=1))),
    ).fetchall()
    by_bucket = {int(row["bucket"]): row for row in rows}
    series = []
    for i in range(24):
        dt = start_hour + timedelta(hours=i)
        bucket = int(dt.astimezone(timezone.utc).timestamp() // 3600 * 3600)
        row = by_bucket.get(bucket)
        series.append(
            {
                "label": dt.astimezone(tz).strftime("%H:00"),
                "pv": int(row["pv"]) if row else 0,
                "uv": int(row["uv"]) if row else 0,
            }
        )
    return series


def daily_series(conn, end_dt):
    tz = get_tz()
    today = local_midnight(end_dt)
    start = today - timedelta(days=29)
    rows = conn.execute(
        """
        SELECT date(ts, 'unixepoch', '+8 hours') AS day, COUNT(*) AS pv, COUNT(DISTINCT visitor_id) AS uv
        FROM events
        WHERE event_type='pageview' AND ts>=? AND ts<?
        GROUP BY day
        """,
        (to_ts(start), to_ts(today + timedelta(days=1))),
    ).fetchall()
    by_day = {row["day"]: row for row in rows}
    series = []
    for i in range(30):
        dt = start + timedelta(days=i)
        key = dt.astimezone(tz).strftime("%Y-%m-%d")
        row = by_day.get(key)
        series.append(
            {
                "label": dt.astimezone(tz).strftime("%m-%d"),
                "date": key,
                "pv": int(row["pv"]) if row else 0,
                "uv": int(row["uv"]) if row else 0,
            }
        )
    return series


def build_stats():
    tz = get_tz()
    now = datetime.now(tz)
    end = to_ts(now)
    today_start = to_ts(local_midnight(now))
    seven_start = to_ts(now - timedelta(days=7))
    month_start = to_ts(local_midnight(now.replace(day=1)))
    five_min = end - 5 * 60
    thirty_min = end - 30 * 60

    with get_db() as conn:
        top_pages = [
            dict(row)
            for row in conn.execute(
                """
                SELECT path, COUNT(*) AS pv, COUNT(DISTINCT visitor_id) AS uv
                FROM events
                WHERE event_type='pageview' AND ts>=?
                GROUP BY path
                ORDER BY pv DESC
                LIMIT 10
                """,
                (seven_start,),
            ).fetchall()
        ]
        top_referrers = [
            dict(row)
            for row in conn.execute(
                """
                SELECT COALESCE(NULLIF(referrer, ''), '直接访问') AS referrer, COUNT(*) AS pv
                FROM events
                WHERE event_type='pageview' AND ts>=?
                GROUP BY COALESCE(NULLIF(referrer, ''), '直接访问')
                ORDER BY pv DESC
                LIMIT 10
                """,
                (seven_start,),
            ).fetchall()
        ]
        latest = [
            dict(row)
            for row in conn.execute(
                """
                SELECT ts, event_type, visitor_id, session_id, path, referrer, user_agent
                FROM events
                ORDER BY ts DESC
                LIMIT 25
                """
            ).fetchall()
        ]

        return {
            "generatedAt": end,
            "timezone": STATS_TZ,
            "today": metric_for(conn, today_start, end + 1),
            "sevenDays": metric_for(conn, seven_start, end + 1),
            "month": metric_for(conn, month_start, end + 1),
            "realtime": {
                "activeVisitors5m": count_row(conn, "SELECT COUNT(*) FROM visitors WHERE last_seen>=?", (five_min,)),
                "activeSessions30m": count_row(conn, "SELECT COUNT(*) FROM sessions WHERE last_seen>=?", (thirty_min,)),
                "totalVisitors": count_row(conn, "SELECT COUNT(*) FROM visitors"),
                "totalSessions": count_row(conn, "SELECT COUNT(*) FROM sessions"),
            },
            "newVisitors": {
                "today": count_row(conn, "SELECT COUNT(*) FROM visitors WHERE first_seen>=?", (today_start,)),
                "sevenDays": count_row(conn, "SELECT COUNT(*) FROM visitors WHERE first_seen>=?", (seven_start,)),
                "month": count_row(conn, "SELECT COUNT(*) FROM visitors WHERE first_seen>=?", (month_start,)),
            },
            "series": {
                "hourly": hourly_series(conn, now),
                "daily": daily_series(conn, now),
            },
            "topPages": top_pages,
            "topReferrers": top_referrers,
            "latest": latest,
        }


def record_event(handler):
    length = int(handler.headers.get("Content-Length", "0") or "0")
    if length <= 0 or length > MAX_BODY:
        json_response(handler, {"ok": False, "error": "invalid body"}, HTTPStatus.BAD_REQUEST)
        return

    try:
        payload = json.loads(handler.rfile.read(length).decode("utf-8"))
    except Exception:
        json_response(handler, {"ok": False, "error": "invalid json"}, HTTPStatus.BAD_REQUEST)
        return

    event_type = sanitize(payload.get("eventType") or "pageview", 32)
    if event_type not in {"pageview", "heartbeat"}:
        event_type = "pageview"

    visitor_id = sanitize(payload.get("visitorId"), 128)
    session_id = sanitize(payload.get("sessionId"), 128)
    if not visitor_id or not session_id:
        json_response(handler, {"ok": False, "error": "missing visitor/session"}, HTTPStatus.BAD_REQUEST)
        return

    forwarded_for = handler.headers.get("CF-Connecting-IP") or handler.headers.get("X-Forwarded-For", "")
    raw_ip = forwarded_for.split(",")[0].strip() if forwarded_for else handler.client_address[0]
    ts = now_ts()
    row = {
        "ts": ts,
        "event_type": event_type,
        "visitor_id": visitor_id,
        "session_id": session_id,
        "path": sanitize(payload.get("path") or "/", 512),
        "referrer": sanitize(payload.get("referrer"), 512),
        "title": sanitize(payload.get("title"), 256),
        "user_agent": sanitize(handler.headers.get("User-Agent"), 512),
        "ip_hash": ip_hash(raw_ip),
        "screen": sanitize(payload.get("screen"), 64),
        "tz": sanitize(payload.get("tz"), 64),
    }

    with get_db() as conn:
        conn.execute(
            """
            INSERT INTO events (ts,event_type,visitor_id,session_id,path,referrer,title,user_agent,ip_hash,screen,tz)
            VALUES (:ts,:event_type,:visitor_id,:session_id,:path,:referrer,:title,:user_agent,:ip_hash,:screen,:tz)
            """,
            row,
        )
        conn.execute(
            """
            INSERT INTO visitors (visitor_id, first_seen, last_seen, last_path, user_agent, ip_hash)
            VALUES (:visitor_id, :ts, :ts, :path, :user_agent, :ip_hash)
            ON CONFLICT(visitor_id) DO UPDATE SET
              last_seen=excluded.last_seen,
              last_path=excluded.last_path,
              user_agent=excluded.user_agent,
              ip_hash=excluded.ip_hash
            """,
            row,
        )
        conn.execute(
            """
            INSERT INTO sessions (session_id, visitor_id, first_seen, last_seen)
            VALUES (:session_id, :visitor_id, :ts, :ts)
            ON CONFLICT(session_id) DO UPDATE SET last_seen=excluded.last_seen
            """,
            row,
        )

    json_response(handler, {"ok": True})


def bounded_int(value, default, min_value, max_value):
    try:
        parsed = int(value)
    except Exception:
        parsed = default
    return max(min_value, min(parsed, max_value))


def fetch_fund_valuation_ranking(handler):
    length = int(handler.headers.get("Content-Length", "0") or "0")
    if length < 0 or length > MARKET_MAX_BODY:
        json_response(handler, {"success": False, "error": "invalid body"}, HTTPStatus.BAD_REQUEST)
        return

    try:
        payload = json.loads(handler.rfile.read(length).decode("utf-8")) if length else {}
    except Exception:
        json_response(handler, {"success": False, "error": "invalid json"}, HTTPStatus.BAD_REQUEST)
        return

    sort = bounded_int(payload.get("sort"), 3, 3, 5)
    order = "asc" if str(payload.get("order", "desc")).lower() == "asc" else "desc"
    page = bounded_int(payload.get("page"), 1, 1, 200)
    page_size = bounded_int(payload.get("pageSize"), 20, 1, 100)

    params = urlencode(
        {
            "type": 1,
            "sort": sort,
            "orderType": order,
            "canbuy": 0,
            "pageIndex": page,
            "pageSize": page_size,
        }
    )
    api_url = f"https://api.fund.eastmoney.com/FundGuZhi/GetFundGZList?{params}"
    req = urllib_request.Request(
        api_url,
        headers={
            "Accept": "application/json,text/plain,*/*",
            "Referer": "https://fund.eastmoney.com/",
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
        },
    )

    try:
        with urllib_request.urlopen(req, timeout=12) as response:
            raw = response.read(2 * 1024 * 1024)
        upstream_data = json.loads(raw.decode("utf-8-sig"))
    except urllib_error.HTTPError as err:
        json_response(
            handler,
            {"success": False, "error": f"天天基金接口请求失败 ({err.code})"},
            HTTPStatus.BAD_GATEWAY,
        )
        return
    except Exception as err:
        json_response(
            handler,
            {"success": False, "error": f"天天基金接口请求失败: {sanitize(err, 160)}"},
            HTTPStatus.BAD_GATEWAY,
        )
        return

    data = upstream_data.get("Data") if isinstance(upstream_data, dict) else None
    if not isinstance(data, dict):
        json_response(handler, {"success": False, "error": "天天基金接口返回格式异常"}, HTTPStatus.BAD_GATEWAY)
        return

    json_response(handler, {"success": True, "data": data})


OPS_HTML = r"""<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>估基运营管理台</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f6f7fb;
      --panel: #ffffff;
      --text: #111827;
      --muted: #64748b;
      --border: #d9e0ea;
      --blue: #2563eb;
      --green: #059669;
      --rose: #e11d48;
      --amber: #b45309;
      --violet: #7c3aed;
      --shadow: 0 18px 50px rgba(15, 23, 42, .08);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: var(--bg);
      color: var(--text);
    }
    header {
      position: sticky;
      top: 0;
      z-index: 5;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 16px 24px;
      border-bottom: 1px solid var(--border);
      background: rgba(246, 247, 251, .92);
      backdrop-filter: blur(14px);
    }
    h1 { margin: 0; font-size: 20px; }
    main { width: min(1280px, 100%); margin: 0 auto; padding: 24px; }
    .toolbar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    input, button {
      height: 40px;
      border-radius: 8px;
      border: 1px solid var(--border);
      padding: 0 12px;
      font: inherit;
    }
    input { min-width: min(360px, 80vw); background: #fff; color: var(--text); }
    button { cursor: pointer; background: var(--text); color: #fff; font-weight: 650; }
    button.secondary { background: #fff; color: var(--text); }
    .status { color: var(--muted); font-size: 13px; }
    .metrics {
      display: grid;
      grid-template-columns: repeat(6, minmax(150px, 1fr));
      gap: 12px;
    }
    .metric, .panel {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 8px;
      box-shadow: var(--shadow);
    }
    .metric { padding: 16px; min-height: 112px; }
    .label { color: var(--muted); font-size: 13px; }
    .value { margin-top: 8px; font-size: 28px; font-weight: 760; letter-spacing: 0; }
    .sub { margin-top: 6px; color: var(--muted); font-size: 12px; }
    .blue { color: var(--blue); } .green { color: var(--green); } .rose { color: var(--rose); }
    .amber { color: var(--amber); } .violet { color: var(--violet); }
    .grid { display: grid; grid-template-columns: 2fr 1fr; gap: 12px; margin-top: 12px; }
    .panel { padding: 16px; min-width: 0; }
    .panel h2 { margin: 0 0 12px; font-size: 15px; }
    .bars { display: grid; grid-template-columns: repeat(24, minmax(8px, 1fr)); gap: 4px; height: 180px; align-items: end; }
    .bar { min-height: 2px; border-radius: 4px 4px 0 0; background: var(--blue); opacity: .86; }
    .bar.uv { background: var(--green); opacity: .72; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 10px 8px; border-bottom: 1px solid var(--border); text-align: left; vertical-align: top; }
    th { color: var(--muted); font-size: 12px; font-weight: 650; }
    td { word-break: break-word; }
    .empty { color: var(--muted); padding: 20px 0; text-align: center; }
    .hidden { display: none; }
    @media (max-width: 980px) {
      header { align-items: flex-start; flex-direction: column; }
      .metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .grid { grid-template-columns: 1fr; }
    }
    @media (max-width: 560px) {
      main { padding: 14px; }
      header { padding: 14px; }
      .metrics { grid-template-columns: 1fr; }
      input { min-width: 100%; width: 100%; }
      .toolbar { width: 100%; }
    }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>估基运营管理台</h1>
      <div class="status" id="status">等待加载</div>
    </div>
    <div class="toolbar">
      <input id="password" type="password" autocomplete="current-password" placeholder="管理员密码">
      <button id="save">连接</button>
      <button class="secondary" id="refresh">刷新</button>
    </div>
  </header>
  <main>
    <section class="metrics">
      <div class="metric"><div class="label">当前客户量</div><div class="value blue" id="active">0</div><div class="sub">最近 5 分钟活跃 UV</div></div>
      <div class="metric"><div class="label">今日 PV</div><div class="value green" id="todayPv">0</div><div class="sub">今日 UV <span id="todayUv">0</span></div></div>
      <div class="metric"><div class="label">7 日 PV</div><div class="value violet" id="weekPv">0</div><div class="sub">7 日 UV <span id="weekUv">0</span></div></div>
      <div class="metric"><div class="label">本月 PV</div><div class="value amber" id="monthPv">0</div><div class="sub">本月 UV <span id="monthUv">0</span></div></div>
      <div class="metric"><div class="label">活跃会话</div><div class="value rose" id="sessions">0</div><div class="sub">最近 30 分钟</div></div>
      <div class="metric"><div class="label">累计客户</div><div class="value" id="totalVisitors">0</div><div class="sub">今日新客 <span id="newToday">0</span></div></div>
    </section>

    <section class="grid">
      <div class="panel">
        <h2>最近 24 小时 PV/UV</h2>
        <div class="bars" id="hourlyBars"></div>
      </div>
      <div class="panel">
        <h2>Top 页面</h2>
        <table><thead><tr><th>页面</th><th>PV</th><th>UV</th></tr></thead><tbody id="topPages"></tbody></table>
      </div>
    </section>

    <section class="grid">
      <div class="panel">
        <h2>最近访问</h2>
        <table><thead><tr><th>时间</th><th>事件</th><th>页面</th></tr></thead><tbody id="latest"></tbody></table>
      </div>
      <div class="panel">
        <h2>来源</h2>
        <table><thead><tr><th>来源</th><th>PV</th></tr></thead><tbody id="topReferrers"></tbody></table>
      </div>
    </section>
  </main>
  <script>
    const $ = (id) => document.getElementById(id);
    const fmt = (n) => Number(n || 0).toLocaleString('zh-CN');
    const passwordInput = $('password');
    let timer = null;

    function setStatus(text) { $('status').textContent = text; }
    function setRows(id, rows, render) {
      const el = $(id);
      el.innerHTML = rows.length ? rows.map(render).join('') : '<tr><td colspan="3" class="empty">暂无数据</td></tr>';
    }
    function escapeHtml(s) {
      return String(s || '').replace(/[&<>"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
    }
    function renderBars(rows) {
      const max = Math.max(1, ...rows.map((x) => x.pv));
      $('hourlyBars').innerHTML = rows.map((x) => {
        const h = Math.max(2, Math.round((x.pv / max) * 170));
        return `<div class="bar" title="${escapeHtml(x.label)} PV ${fmt(x.pv)} / UV ${fmt(x.uv)}" style="height:${h}px"></div>`;
      }).join('');
    }
    async function load() {
      const password = passwordInput.value;
      if (!password) { setStatus('请输入管理员密码'); return; }
      setStatus('加载中...');
      const res = await fetch('/api/analytics/stats', { headers: { 'X-Admin-Password': password } });
      if (!res.ok) {
        setStatus(res.status === 401 ? '管理员密码无效' : `加载失败 ${res.status}`);
        return;
      }
      const data = await res.json();
      $('active').textContent = fmt(data.realtime.activeVisitors5m);
      $('todayPv').textContent = fmt(data.today.pv);
      $('todayUv').textContent = fmt(data.today.uv);
      $('weekPv').textContent = fmt(data.sevenDays.pv);
      $('weekUv').textContent = fmt(data.sevenDays.uv);
      $('monthPv').textContent = fmt(data.month.pv);
      $('monthUv').textContent = fmt(data.month.uv);
      $('sessions').textContent = fmt(data.realtime.activeSessions30m);
      $('totalVisitors').textContent = fmt(data.realtime.totalVisitors);
      $('newToday').textContent = fmt(data.newVisitors.today);
      renderBars(data.series.hourly || []);
      setRows('topPages', data.topPages || [], (x) => `<tr><td>${escapeHtml(x.path)}</td><td>${fmt(x.pv)}</td><td>${fmt(x.uv)}</td></tr>`);
      setRows('topReferrers', data.topReferrers || [], (x) => `<tr><td>${escapeHtml(x.referrer)}</td><td>${fmt(x.pv)}</td></tr>`);
      setRows('latest', data.latest || [], (x) => `<tr><td>${new Date(x.ts * 1000).toLocaleString('zh-CN')}</td><td>${escapeHtml(x.event_type)}</td><td>${escapeHtml(x.path)}</td></tr>`);
      setStatus(`已更新 ${new Date(data.generatedAt * 1000).toLocaleString('zh-CN')} · ${data.timezone}`);
      if (!timer) timer = setInterval(load, 15000);
    }
    $('save').addEventListener('click', load);
    $('refresh').addEventListener('click', load);
    passwordInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') load(); });
  </script>
</body>
</html>"""


class Handler(BaseHTTPRequestHandler):
    server_version = "GujiOps/1.0"

    def log_message(self, fmt, *args):
        print("%s - - [%s] %s" % (self.client_address[0], self.log_date_time_string(), fmt % args), flush=True)

    def do_OPTIONS(self):
        self.send_response(HTTPStatus.NO_CONTENT)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Admin-Password, Authorization, apikey")
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/health":
            json_response(self, {"ok": True, "service": "guji-analytics"})
            return
        if parsed.path in {"/", "/ops", "/ops/"}:
            text_response(self, OPS_HTML)
            return
        if parsed.path == "/api/analytics/stats":
            if not is_authorized(self):
                json_response(self, {"ok": False, "error": "unauthorized"}, HTTPStatus.UNAUTHORIZED)
                return
            json_response(self, build_stats())
            return
        json_response(self, {"ok": False, "error": "not found"}, HTTPStatus.NOT_FOUND)

    def do_HEAD(self):
        parsed = urlparse(self.path)
        if parsed.path in {"/", "/ops", "/ops/", "/health", "/api/analytics/stats"}:
            head_response(self)
            return
        head_response(self, HTTPStatus.NOT_FOUND, "application/json; charset=utf-8")

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/analytics/track":
            record_event(self)
            return
        if parsed.path == "/api/fund-valuation-ranking":
            fetch_fund_valuation_ranking(self)
            return
        json_response(self, {"ok": False, "error": "not found"}, HTTPStatus.NOT_FOUND)


def main():
    init_db()
    port = int(os.environ.get("PORT", "8787"))
    server = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    print(f"Guji analytics listening on :{port}, db={DB_PATH}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
