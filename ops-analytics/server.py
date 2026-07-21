import hashlib
import ipaddress
import json
import hmac
import os
import sqlite3
import threading
import time
from datetime import datetime, timedelta, timezone
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib import error as urllib_error
from urllib import request as urllib_request
from urllib.parse import parse_qs, urlencode, urlparse
from zoneinfo import ZoneInfo

try:
    import maxminddb
except ImportError:
    maxminddb = None


DB_PATH = os.environ.get("DB_PATH", "/data/analytics.sqlite3")
ADMIN_USERNAME = os.environ.get("ADMIN_USERNAME", "")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "")
ANALYTICS_SALT = os.environ.get("ANALYTICS_SALT", "guji")
STATS_TZ = os.environ.get("STATS_TZ", "Asia/Shanghai")
SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY") or os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY", "")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
GEOIP_DB_PATH = os.environ.get("GEOIP_DB_PATH", "/data/geoip/DBIP-City-Lite.mmdb")
STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")
WORLD_LAND_PATH = os.path.join(STATIC_DIR, "world-land.json")
MAX_BODY = 16 * 1024
MARKET_MAX_BODY = 1024
AUTH_CACHE_TTL = 45
REGISTERED_USERS_CACHE_TTL = 300
MARKET_RATE_LIMIT_SECONDS = 1.0
GLOBAL_QUOTES_CACHE_TTL = 5.0

GLOBAL_QUOTE_GROUPS = (
    (
        "aStock",
        "A股指数",
        (
            ("sh000001", "sh000001", "上证指数", "A股指数"),
            ("sz399001", "sz399001", "深圳成指", "A股指数"),
            ("sz399006", "sz399006", "创业板指", "A股指数"),
            ("bj899050", "bj899050", "北证50", "A股指数"),
            ("sh000688", "sh000688", "科创50", "A股指数"),
            ("sh000905", "sh000905", "中证500", "A股指数"),
            ("sh000300", "sh000300", "沪深300", "A股指数"),
            ("sh000016", "sh000016", "上证50", "A股指数"),
            ("sh000852", "sh000852", "中证1000", "A股指数"),
        ),
    ),
    (
        "global",
        "全球市场",
        (
            ("100.HSI", "hkHSI", "恒生指数", "全球指数"),
            ("100.HSCEI", "hkHSCEI", "国企指数", "全球指数"),
            ("101.DJIA", "usDJI", "道琼斯指数", "全球指数"),
            ("101.NDX", "usNDX", "纳指100", "全球指数"),
            ("101.SPX", "usSPY", "标普500 ETF代理", "ETF代理行情"),
            ("101.N225", "usEWJ", "日本市场 ETF代理", "ETF代理行情"),
            ("101.DAX", "usEWG", "德国市场 ETF代理", "ETF代理行情"),
            ("101.FTSE", "usEWU", "英国市场 ETF代理", "ETF代理行情"),
            ("101.CAC", "usEWQ", "法国市场 ETF代理", "ETF代理行情"),
        ),
    ),
    (
        "commodity",
        "商品相关 ETF",
        (
            ("usGLD", "usGLD", "黄金ETF", "商品相关ETF"),
            ("usSLV", "usSLV", "白银ETF", "商品相关ETF"),
            ("usUSO", "usUSO", "原油ETF", "商品相关ETF"),
            ("usDBA", "usDBA", "农业ETF", "商品相关ETF"),
            ("usCOPP", "usCOPP", "铜矿ETF", "商品相关ETF"),
            ("usUNG", "usUNG", "天然气ETF", "商品相关ETF"),
            ("usGDX", "usGDX", "黄金矿业ETF", "商品相关ETF"),
            ("usSILJ", "usSILJ", "白银矿业ETF", "商品相关ETF"),
            ("usXLE", "usXLE", "能源ETF", "商品相关ETF"),
        ),
    ),
)

AUTH_CACHE = {}
AUTH_CACHE_LOCK = threading.Lock()
REGISTERED_USERS_CACHE = {"expires_at": 0.0, "data": None}
REGISTERED_USERS_CACHE_LOCK = threading.Lock()
REGISTERED_USERS_PAGE_SIZE = 20
RATE_LIMITS = {}
RATE_LIMIT_LOCK = threading.Lock()
GLOBAL_QUOTES_CACHE = {"expires_at": 0.0, "data": None}
GLOBAL_QUOTES_CACHE_LOCK = threading.Lock()
GEOIP_READER = None
GEOIP_READER_PATH = ""
GEOIP_READER_LOCK = threading.Lock()


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
              landing_path TEXT,
              referrer TEXT,
              utm_source TEXT,
              utm_medium TEXT,
              utm_campaign TEXT,
              utm_content TEXT,
              utm_term TEXT,
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
            CREATE TABLE IF NOT EXISTS geo_cache (
              ip_hash TEXT PRIMARY KEY,
              country_code TEXT,
              country_name TEXT,
              city TEXT,
              latitude REAL,
              longitude REAL,
              updated_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts);
            CREATE INDEX IF NOT EXISTS idx_events_type_ts ON events(event_type, ts);
            CREATE INDEX IF NOT EXISTS idx_events_visitor_ts ON events(visitor_id, ts);
            CREATE INDEX IF NOT EXISTS idx_visitors_last_seen ON visitors(last_seen);
            CREATE INDEX IF NOT EXISTS idx_sessions_last_seen ON sessions(last_seen);
            CREATE INDEX IF NOT EXISTS idx_geo_cache_coordinates ON geo_cache(latitude, longitude);
            """
        )
        event_columns = {row["name"] for row in conn.execute("PRAGMA table_info(events)").fetchall()}
        for column in (
            "landing_path",
            "utm_source",
            "utm_medium",
            "utm_campaign",
            "utm_content",
            "utm_term",
        ):
            if column not in event_columns:
                conn.execute(f"ALTER TABLE events ADD COLUMN {column} TEXT")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_events_utm ON events(utm_source, utm_medium, ts)")


def ip_hash(raw_ip):
    ip = sanitize(raw_ip, 128)
    if not ip:
        return ""
    return hashlib.sha256(f"{ANALYTICS_SALT}:{ip}".encode("utf-8")).hexdigest()


def get_geoip_reader():
    """Open the local GeoIP database once; visitor IPs never leave this process."""
    global GEOIP_READER, GEOIP_READER_PATH

    if maxminddb is None or not GEOIP_DB_PATH or not os.path.isfile(GEOIP_DB_PATH):
        return None

    with GEOIP_READER_LOCK:
        if GEOIP_READER is not None and GEOIP_READER_PATH == GEOIP_DB_PATH:
            return GEOIP_READER
        try:
            GEOIP_READER = maxminddb.open_database(GEOIP_DB_PATH)
            GEOIP_READER_PATH = GEOIP_DB_PATH
        except Exception as err:
            print(f"GeoIP database unavailable: {sanitize(err, 160)}", flush=True)
            GEOIP_READER = None
            GEOIP_READER_PATH = ""
        return GEOIP_READER


def geo_text(value):
    if not isinstance(value, dict):
        return sanitize(value, 96)
    names = value.get("names")
    if isinstance(names, dict):
        for language in ("zh-CN", "zh", "en"):
            if names.get(language):
                return sanitize(names[language], 96)
    return sanitize(value.get("name"), 96)


def lookup_geoip(raw_ip):
    """Resolve an internet-routable address with the on-disk city database only."""
    try:
        address = ipaddress.ip_address(raw_ip)
    except ValueError:
        return None
    if not address.is_global:
        return None

    reader = get_geoip_reader()
    if reader is None:
        return None
    try:
        record = reader.get(str(address)) or {}
        country = record.get("country") or record.get("registered_country") or {}
        location = record.get("location") or {}
        latitude = float(location.get("latitude"))
        longitude = float(location.get("longitude"))
    except (TypeError, ValueError, AttributeError):
        return None
    except Exception as err:
        print(f"GeoIP lookup failed: {sanitize(err, 160)}", flush=True)
        return None

    if not -90 <= latitude <= 90 or not -180 <= longitude <= 180:
        return None
    return {
        "country_code": sanitize(country.get("iso_code"), 8).upper(),
        "country_name": geo_text(country),
        "city": geo_text(record.get("city")),
        # City-level sources are already approximate. Keep an additional coarse
        # precision so the console cannot be used to infer a household location.
        "latitude": round(latitude, 1),
        "longitude": round(longitude, 1),
    }


def cache_geoip(conn, raw_ip, hashed_ip, ts):
    """Persist only an anonymous, coarse lookup result (or a one-time miss)."""
    if not hashed_ip:
        return
    known = conn.execute("SELECT 1 FROM geo_cache WHERE ip_hash=?", (hashed_ip,)).fetchone()
    if known:
        return

    geo = lookup_geoip(raw_ip) or {}
    conn.execute(
        """
        INSERT OR IGNORE INTO geo_cache
          (ip_hash, country_code, country_name, city, latitude, longitude, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            hashed_ip,
            geo.get("country_code", ""),
            geo.get("country_name", ""),
            geo.get("city", ""),
            geo.get("latitude"),
            geo.get("longitude"),
            ts,
        ),
    )


def json_response(handler, data, status=HTTPStatus.OK, extra_headers=None):
    body = json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Cache-Control", "no-store")
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header(
        "Access-Control-Allow-Headers",
        "Content-Type, X-Admin-Username, X-Admin-Password, Authorization, apikey",
    )
    for key, value in (extra_headers or {}).items():
        handler.send_header(key, str(value))
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


def static_file_response(handler, path, content_type):
    try:
        with open(path, "rb") as file:
            body = file.read()
    except OSError:
        json_response(handler, {"ok": False, "error": "not found"}, HTTPStatus.NOT_FOUND)
        return
    handler.send_response(HTTPStatus.OK)
    handler.send_header("Content-Type", content_type)
    handler.send_header("Cache-Control", "public, max-age=31536000, immutable")
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
    if not ADMIN_USERNAME or not ADMIN_PASSWORD:
        return False
    supplied_username = handler.headers.get("X-Admin-Username", "")
    supplied_password = handler.headers.get("X-Admin-Password", "")
    username_matches = hmac.compare_digest(supplied_username, ADMIN_USERNAME)
    password_matches = hmac.compare_digest(supplied_password, ADMIN_PASSWORD)
    return username_matches and password_matches


def get_bearer_token(handler):
    auth = handler.headers.get("Authorization", "")
    if not auth.lower().startswith("bearer "):
        return ""
    return auth.split(" ", 1)[1].strip()


def get_authenticated_user_id(handler):
    token = get_bearer_token(handler)
    if not token:
        return None, HTTPStatus.UNAUTHORIZED, "请先登录"
    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        return None, HTTPStatus.SERVICE_UNAVAILABLE, "登录校验服务未配置"

    now = time.monotonic()
    with AUTH_CACHE_LOCK:
        cached = AUTH_CACHE.get(token)
        if cached and cached["expires_at"] > now:
            return cached["user_id"], None, None

    auth_url = f"{SUPABASE_URL.rstrip('/')}/auth/v1/user"
    req = urllib_request.Request(
        auth_url,
        headers={
            "apikey": SUPABASE_ANON_KEY,
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
        },
    )

    try:
        with urllib_request.urlopen(req, timeout=8) as response:
            raw = response.read(256 * 1024)
        payload = json.loads(raw.decode("utf-8"))
    except urllib_error.HTTPError as err:
        if err.code in {401, 403}:
            return None, HTTPStatus.UNAUTHORIZED, "登录状态已失效"
        return None, HTTPStatus.BAD_GATEWAY, f"登录校验失败 ({err.code})"
    except Exception as err:
        return None, HTTPStatus.BAD_GATEWAY, f"登录校验失败: {sanitize(err, 120)}"

    user_id = sanitize(payload.get("id") if isinstance(payload, dict) else "", 128)
    if not user_id:
        return None, HTTPStatus.UNAUTHORIZED, "登录状态已失效"

    with AUTH_CACHE_LOCK:
        AUTH_CACHE[token] = {"user_id": user_id, "expires_at": now + AUTH_CACHE_TTL}
    return user_id, None, None


def parse_total_count(headers):
    for key in ("X-Total-Count", "x-total-count"):
        value = headers.get(key)
        if value is None:
            continue
        try:
            return max(0, int(value))
        except Exception:
            pass

    content_range = headers.get("Content-Range") or headers.get("content-range") or ""
    if "/" not in content_range:
        return None
    total_part = content_range.rsplit("/", 1)[-1].strip()
    if not total_part or total_part == "*":
        return None
    try:
        return max(0, int(total_part))
    except Exception:
        return None


def fetch_registered_users_page(page, per_page):
    api_url = f"{SUPABASE_URL.rstrip('/')}/auth/v1/admin/users?{urlencode({'page': page, 'per_page': per_page})}"
    req = urllib_request.Request(
        api_url,
        headers={
            "apikey": SUPABASE_SERVICE_ROLE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
            "Accept": "application/json",
        },
    )
    with urllib_request.urlopen(req, timeout=10) as response:
        raw = response.read(4 * 1024 * 1024)
        total = parse_total_count(response.headers)
    payload = json.loads(raw.decode("utf-8")) if raw else {}
    if isinstance(payload, dict):
        users = payload.get("users") if isinstance(payload.get("users"), list) else []
        if total is None:
            for key in ("total", "total_count", "totalCount"):
                try:
                    if payload.get(key) is not None:
                        total = max(0, int(payload[key]))
                        break
                except (TypeError, ValueError):
                    pass
    elif isinstance(payload, list):
        users = payload
    else:
        users = []
    return users, total


def normalize_registered_user(user):
    if not isinstance(user, dict):
        return None
    email = sanitize(user.get("email"), 320)
    if not email:
        return None
    return {
        "email": email,
        "createdAt": sanitize(user.get("created_at"), 64),
        "lastSignInAt": sanitize(user.get("last_sign_in_at"), 64),
        "emailConfirmed": bool(user.get("email_confirmed_at") or user.get("confirmed_at")),
    }


def fetch_registered_users_listing(page, per_page):
    """Return one protected, browser-ready page from Supabase Auth."""
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        return {
            "configured": False,
            "page": page,
            "perPage": per_page,
            "total": None,
            "totalKnown": False,
            "hasMore": False,
            "users": [],
            "error": "未配置 SUPABASE_SERVICE_ROLE_KEY",
        }

    users, total = fetch_registered_users_page(page, per_page)
    normalized = [user for user in (normalize_registered_user(item) for item in users) if user]
    return {
        "configured": True,
        "page": page,
        "perPage": per_page,
        "total": total,
        "totalKnown": total is not None,
        "hasMore": len(users) >= per_page,
        "users": normalized,
        "fetchedAt": now_ts(),
        "error": "",
    }


def fetch_registered_users_summary():
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        return {
            "configured": False,
            "count": None,
            "source": "supabase_auth_admin",
            "error": "未配置 SUPABASE_SERVICE_ROLE_KEY",
        }

    now = time.monotonic()
    with REGISTERED_USERS_CACHE_LOCK:
        cached = REGISTERED_USERS_CACHE.get("data")
        if cached and REGISTERED_USERS_CACHE.get("expires_at", 0) > now:
            return cached

    try:
        per_page = 1000
        page = 1
        total_count = None
        scanned = 0
        email_count = 0

        while page <= 100:
            users, page_total = fetch_registered_users_page(page, per_page)
            if total_count is None and page_total is not None:
                total_count = page_total
            scanned += len(users)
            email_count += sum(1 for user in users if isinstance(user, dict) and user.get("email"))

            if not users or len(users) < per_page:
                break
            if total_count is not None and scanned >= total_count:
                break
            page += 1

        summary = {
            "configured": True,
            "count": email_count,
            "source": "supabase_auth_admin",
            "scanned": scanned,
            "totalAuthUsers": total_count if total_count is not None else scanned,
            "fetchedAt": now_ts(),
            "error": "",
        }
    except urllib_error.HTTPError as err:
        if err.code in {401, 403}:
            message = "SUPABASE_SERVICE_ROLE_KEY 无权限"
        else:
            message = f"Supabase Auth 统计失败 ({err.code})"
        summary = {
            "configured": True,
            "count": None,
            "source": "supabase_auth_admin",
            "error": message,
        }
    except Exception as err:
        summary = {
            "configured": True,
            "count": None,
            "source": "supabase_auth_admin",
            "error": f"Supabase Auth 统计失败: {sanitize(err, 120)}",
        }

    with REGISTERED_USERS_CACHE_LOCK:
        REGISTERED_USERS_CACHE["data"] = summary
        REGISTERED_USERS_CACHE["expires_at"] = now + REGISTERED_USERS_CACHE_TTL
    return summary


def authorize_market_request(handler):
    user_id, status, error = get_authenticated_user_id(handler)
    if error:
        json_response(handler, {"success": False, "error": error}, status)
        return None

    now = time.monotonic()
    with RATE_LIMIT_LOCK:
        last_seen = RATE_LIMITS.get(user_id, 0)
        wait_seconds = MARKET_RATE_LIMIT_SECONDS - (now - last_seen)
        if wait_seconds > 0:
            retry_after = max(1, int(wait_seconds + 0.999))
            json_response(
                handler,
                {"success": False, "error": "请求过于频繁，请稍后再试"},
                HTTPStatus.TOO_MANY_REQUESTS,
                {"Retry-After": retry_after},
            )
            return None
        RATE_LIMITS[user_id] = now
    return user_id


def optional_float(value):
    try:
        number = float(value)
        if number != number or number in {float("inf"), float("-inf")}:
            return None
        return number
    except Exception:
        return None


def parse_tencent_quote_rows(text):
    rows = {}
    for raw_line in str(text or "").splitlines():
        line = raw_line.strip()
        if not line.startswith("v_") or '="' not in line:
            continue
        prefix, payload = line.split('="', 1)
        code = prefix[2:]
        payload = payload.rsplit('"', 1)[0]
        rows[code] = payload.split("~")
    return rows


def is_a_stock_trading_time():
    now = datetime.now(get_tz())
    minutes = now.hour * 60 + now.minute
    return now.weekday() < 5 and ((570 <= minutes <= 690) or (780 <= minutes < 900))


def fetch_global_quotes(handler):
    now = time.monotonic()
    with GLOBAL_QUOTES_CACHE_LOCK:
        cached = GLOBAL_QUOTES_CACHE.get("data")
        if cached and GLOBAL_QUOTES_CACHE.get("expires_at", 0) > now:
            json_response(handler, {"success": True, "data": cached})
            return

    provider_codes = [row[1] for _, _, group_rows in GLOBAL_QUOTE_GROUPS for row in group_rows]
    api_url = f"https://qt.gtimg.cn/q={','.join(provider_codes)}"
    req = urllib_request.Request(
        api_url,
        headers={
            "Accept": "text/plain,*/*",
            "Referer": "https://gu.qq.com/",
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
        },
    )

    try:
        with urllib_request.urlopen(req, timeout=12) as response:
            raw = response.read(1024 * 1024)
        quote_rows = parse_tencent_quote_rows(raw.decode("gb18030", errors="replace"))
    except urllib_error.HTTPError as err:
        json_response(handler, {"success": False, "error": f"全球行情接口请求失败 ({err.code})"}, HTTPStatus.BAD_GATEWAY)
        return
    except Exception as err:
        json_response(
            handler,
            {"success": False, "error": f"全球行情接口请求失败: {sanitize(err, 160)}"},
            HTTPStatus.BAD_GATEWAY,
        )
        return

    groups = []
    resolved_count = 0
    for group_id, title, group_rows in GLOBAL_QUOTE_GROUPS:
        items = []
        for code, provider_code, name, quote_type in group_rows:
            parts = quote_rows.get(provider_code, [])
            price = optional_float(parts[3] if len(parts) > 3 else None)
            change = optional_float(parts[31] if len(parts) > 31 else None)
            pct = optional_float(parts[32] if len(parts) > 32 else None)
            if price is not None:
                resolved_count += 1
            items.append(
                {
                    "code": code,
                    "providerCode": provider_code,
                    "name": name,
                    "type": quote_type,
                    "price": price,
                    "change": change,
                    "pct": pct,
                    "preClose": optional_float(parts[4] if len(parts) > 4 else None),
                    "open": optional_float(parts[5] if len(parts) > 5 else None),
                    "high": optional_float(parts[33] if len(parts) > 33 else None),
                    "low": optional_float(parts[34] if len(parts) > 34 else None),
                    "volume": optional_float(parts[36] if len(parts) > 36 else None),
                    "amount": optional_float(parts[37] if len(parts) > 37 else None),
                    "updateTime": sanitize(parts[30] if len(parts) > 30 else "", 32),
                }
            )
        groups.append({"id": group_id, "title": title, "items": items})

    if resolved_count == 0:
        json_response(handler, {"success": False, "error": "全球行情接口暂无可用数据"}, HTTPStatus.BAD_GATEWAY)
        return

    data = {
        "groups": groups,
        "isAStockTrading": is_a_stock_trading_time(),
        "updatedAt": datetime.now(get_tz()).isoformat(),
    }
    with GLOBAL_QUOTES_CACHE_LOCK:
        GLOBAL_QUOTES_CACHE["data"] = data
        GLOBAL_QUOTES_CACHE["expires_at"] = time.monotonic() + GLOBAL_QUOTES_CACHE_TTL
    json_response(handler, {"success": True, "data": data})


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
                "date": dt.astimezone(tz).strftime("%Y-%m-%d %H:00"),
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


def weekly_geo_summary(conn, start_ts):
    total_ips = count_row(
        conn,
        """
        SELECT COUNT(DISTINCT ip_hash)
        FROM events
        WHERE event_type='pageview' AND ts>=? AND ip_hash<>''
        """,
        (start_ts,),
    )
    located_ips = count_row(
        conn,
        """
        SELECT COUNT(DISTINCT e.ip_hash)
        FROM events e
        INNER JOIN geo_cache g ON g.ip_hash=e.ip_hash
        WHERE e.event_type='pageview' AND e.ts>=? AND g.latitude IS NOT NULL AND g.longitude IS NOT NULL
        """,
        (start_ts,),
    )
    rows = conn.execute(
        """
        SELECT
          g.country_code,
          COALESCE(NULLIF(g.country_name, ''), '未知地区') AS country_name,
          COALESCE(NULLIF(g.city, ''), '城市级区域') AS city,
          g.latitude,
          g.longitude,
          COUNT(*) AS pv,
          COUNT(DISTINCT e.visitor_id) AS uv,
          COUNT(DISTINCT e.ip_hash) AS ips
        FROM events e
        INNER JOIN geo_cache g ON g.ip_hash=e.ip_hash
        WHERE e.event_type='pageview' AND e.ts>=? AND g.latitude IS NOT NULL AND g.longitude IS NOT NULL
        GROUP BY g.country_code, g.country_name, g.city, g.latitude, g.longitude
        ORDER BY pv DESC, ips DESC
        LIMIT 250
        """,
        (start_ts,),
    ).fetchall()
    points = [
        {
            "countryCode": row["country_code"],
            "country": row["country_name"],
            "city": row["city"],
            "lat": float(row["latitude"]),
            "lng": float(row["longitude"]),
            "pv": int(row["pv"]),
            "uv": int(row["uv"]),
            "ips": int(row["ips"]),
        }
        for row in rows
    ]
    return {
        "available": get_geoip_reader() is not None,
        "totalIps": total_ips,
        "locatedIps": located_ips,
        "points": points,
        "topLocations": points[:10],
    }


def page_analytics(conn, start_ts, end_ts, today_start, today_end, tz):
    today_rows = conn.execute(
        """
        SELECT path, COUNT(*) AS pv, COUNT(DISTINCT visitor_id) AS uv
        FROM events
        WHERE event_type='pageview' AND ts>=? AND ts<?
        GROUP BY path
        ORDER BY pv DESC, path ASC
        """,
        (today_start, today_end),
    ).fetchall()

    trend_rows = conn.execute(
        """
        SELECT path, date(ts, 'unixepoch', '+8 hours') AS day,
               COUNT(*) AS pv, COUNT(DISTINCT visitor_id) AS uv
        FROM events
        WHERE event_type='pageview' AND ts>=? AND ts<?
        GROUP BY path, day
        ORDER BY day ASC, pv DESC, path ASC
        """,
        (start_ts, end_ts),
    ).fetchall()

    page_paths = []
    seen_paths = set()
    for row in today_rows:
        path = row["path"]
        if path not in seen_paths:
            page_paths.append(path)
            seen_paths.add(path)
    for row in trend_rows:
        path = row["path"]
        if path not in seen_paths:
            page_paths.append(path)
            seen_paths.add(path)

    trend_by_day = {}
    for row in trend_rows:
        trend_by_day.setdefault(row["day"], {})[row["path"]] = {
            "pv": int(row["pv"]),
            "uv": int(row["uv"]),
        }

    series = []
    first_day = datetime.fromtimestamp(start_ts, tz)
    for index in range(30):
        day = first_day + timedelta(days=index)
        day_key = day.strftime("%Y-%m-%d")
        series.append(
            {
                "date": day_key,
                "label": day.strftime("%m-%d"),
                "pages": trend_by_day.get(day_key, {}),
            }
        )

    return {
        "today": [dict(row) for row in today_rows],
        "trend": {
            "pages": page_paths,
            "series": series,
        },
    }


def describe_referrer(raw_referrer):
    """Reduce a browser referrer to a useful channel and host label."""
    raw = sanitize(raw_referrer, 512)
    if not raw:
        return "直接访问", "直接访问"

    parsed = urlparse(raw if "://" in raw else f"https://{raw}")
    host = (parsed.hostname or "").lower().strip(".")
    if not host:
        return "其他来源", sanitize(raw, 160)
    if host.startswith("www."):
        host = host[4:]

    if host in {"myfunds.cc", "localhost", "127.0.0.1"} or host.endswith(".myfunds.cc"):
        return "站内跳转", host
    if any(name in host for name in ("google.", "baidu.com", "bing.com", "sogou.com", "so.com", "sm.cn")):
        if "google." in host:
            return "Google 搜索", host
        if "baidu.com" in host:
            return "百度搜索", host
        if "bing.com" in host:
            return "Bing 搜索", host
        return "其他搜索", host
    if any(name in host for name in ("weixin.qq.com", "wechat.com", "weibo.com", "douyin.com", "xiaohongshu.com", "zhihu.com", "qq.com")):
        if "weixin.qq.com" in host or "wechat.com" in host:
            return "微信", host
        if "weibo.com" in host:
            return "微博", host
        if "douyin.com" in host:
            return "抖音", host
        if "xiaohongshu.com" in host:
            return "小红书", host
        if "zhihu.com" in host:
            return "知乎", host
        return "QQ", host
    return "外部网站", host


def describe_event_source(referrer, utm_source, utm_medium, utm_campaign):
    source = sanitize(utm_source, 96)
    medium = sanitize(utm_medium, 96)
    campaign = sanitize(utm_campaign, 160)
    if source:
        source_key = source.lower().replace(" ", "")
        source_labels = {
            "qq": "QQ",
            "wechat": "微信",
            "weixin": "微信",
            "weibo": "微博",
            "douyin": "抖音",
            "xiaohongshu": "小红书",
            "zhihu": "知乎",
            "baidu": "百度搜索",
            "google": "Google 搜索",
            "bing": "Bing 搜索",
        }
        channel = source_labels.get(source_key, source)
        detail = f"{source} / {medium}" if medium else source
        return channel, detail, campaign

    channel, detail = describe_referrer(referrer)
    return channel, detail, ""


def source_analytics(conn, start_ts, end_ts):
    """Aggregate UTM attribution first, with referrer fallback for legacy events."""
    buckets = {}
    pv_rows = conn.execute(
        """
        SELECT referrer, utm_source, utm_medium, utm_campaign,
               COALESCE(NULLIF(landing_path, ''), path) AS source_path,
               COUNT(*) AS pv
        FROM events
        WHERE event_type='pageview' AND ts>=? AND ts<?
        GROUP BY referrer, utm_source, utm_medium, utm_campaign, landing_path, path
        """,
        (start_ts, end_ts),
    ).fetchall()
    uv_rows = conn.execute(
        """
        SELECT referrer, utm_source, utm_medium, utm_campaign,
               COUNT(DISTINCT visitor_id) AS uv
        FROM events
        WHERE event_type='pageview' AND ts>=? AND ts<?
        GROUP BY referrer, utm_source, utm_medium, utm_campaign
        """,
        (start_ts, end_ts),
    ).fetchall()

    for row in pv_rows:
        channel, detail, campaign = describe_event_source(
            row["referrer"], row["utm_source"], row["utm_medium"], row["utm_campaign"]
        )
        key = (channel, detail, campaign)
        bucket = buckets.setdefault(
            key,
            {"channel": channel, "detail": detail, "campaign": campaign, "pv": 0, "uv": 0, "paths": {}},
        )
        path = sanitize(row["source_path"] or "/", 512)
        bucket["pv"] += int(row["pv"] or 0)
        bucket["paths"][path] = bucket["paths"].get(path, 0) + int(row["pv"] or 0)

    for row in uv_rows:
        channel, detail, campaign = describe_event_source(
            row["referrer"], row["utm_source"], row["utm_medium"], row["utm_campaign"]
        )
        key = (channel, detail, campaign)
        bucket = buckets.setdefault(
            key,
            {"channel": channel, "detail": detail, "campaign": campaign, "pv": 0, "uv": 0, "paths": {}},
        )
        bucket["uv"] += int(row["uv"] or 0)

    total_pv = sum(item["pv"] for item in buckets.values())
    total_uv = count_row(
        conn,
        "SELECT COUNT(DISTINCT visitor_id) FROM events WHERE event_type='pageview' AND ts>=? AND ts<?",
        (start_ts, end_ts),
    )
    rows = []
    for item in sorted(buckets.values(), key=lambda value: (-value["pv"], value["channel"], value["detail"]))[:20]:
        top_path = max(item["paths"].items(), key=lambda pair: pair[1])[0] if item["paths"] else "-"
        rows.append(
            {
                "channel": item["channel"],
                "detail": item["detail"],
                "campaign": item["campaign"],
                "topPath": top_path,
                "pv": item["pv"],
                "uv": item["uv"],
                "share": round((item["pv"] / total_pv) * 100, 1) if total_pv else 0,
            }
        )
    return {"pv": total_pv, "uv": total_uv, "rows": rows}


def build_stats():
    tz = get_tz()
    now = datetime.now(tz)
    end = to_ts(now)
    today_start = to_ts(local_midnight(now))
    seven_start = to_ts(now - timedelta(days=7))
    month_start = to_ts(local_midnight(now.replace(day=1)))
    page_trend_start = to_ts(local_midnight(now) - timedelta(days=29))
    five_min = end - 5 * 60
    thirty_min = end - 30 * 60

    with get_db() as conn:
        page_stats = page_analytics(
            conn,
            page_trend_start,
            end + 1,
            today_start,
            end + 1,
            tz,
        )
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
        source_stats = {
            "sevenDays": source_analytics(conn, seven_start, end + 1),
            "month": source_analytics(conn, month_start, end + 1),
        }
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
            "registeredUsers": fetch_registered_users_summary(),
            "newVisitors": {
                "today": count_row(conn, "SELECT COUNT(*) FROM visitors WHERE first_seen>=?", (today_start,)),
                "sevenDays": count_row(conn, "SELECT COUNT(*) FROM visitors WHERE first_seen>=?", (seven_start,)),
                "month": count_row(conn, "SELECT COUNT(*) FROM visitors WHERE first_seen>=?", (month_start,)),
            },
            "series": {
                "hourly": hourly_series(conn, now),
                "daily": daily_series(conn, now),
            },
            "geoWeekly": weekly_geo_summary(conn, seven_start),
            "topPages": top_pages,
            "pageToday": page_stats["today"],
            "pageTrend": page_stats["trend"],
            "topReferrers": top_referrers,
            "sourceAnalytics": source_stats,
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
    if event_type.startswith("pwa_"):
        json_response(handler, {"ok": True, "ignored": True})
        return

    if event_type not in {
        "pageview",
        "heartbeat",
    }:
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
        "landing_path": sanitize(payload.get("attributionLandingPath"), 512),
        "referrer": sanitize(payload.get("referrer"), 512),
        "utm_source": sanitize(payload.get("utmSource"), 96),
        "utm_medium": sanitize(payload.get("utmMedium"), 96),
        "utm_campaign": sanitize(payload.get("utmCampaign"), 160),
        "utm_content": sanitize(payload.get("utmContent"), 160),
        "utm_term": sanitize(payload.get("utmTerm"), 160),
        "title": sanitize(payload.get("title"), 256),
        "user_agent": sanitize(handler.headers.get("User-Agent"), 512),
        "ip_hash": ip_hash(raw_ip),
        "screen": sanitize(payload.get("screen"), 64),
        "tz": sanitize(payload.get("tz"), 64),
    }

    with get_db() as conn:
        if event_type == "pageview":
            cache_geoip(conn, raw_ip, row["ip_hash"], ts)
        conn.execute(
            """
            INSERT INTO events (
              ts,event_type,visitor_id,session_id,path,landing_path,referrer,
              utm_source,utm_medium,utm_campaign,utm_content,utm_term,
              title,user_agent,ip_hash,screen,tz
            )
            VALUES (
              :ts,:event_type,:visitor_id,:session_id,:path,:landing_path,:referrer,
              :utm_source,:utm_medium,:utm_campaign,:utm_content,:utm_term,
              :title,:user_agent,:ip_hash,:screen,:tz
            )
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


def fetch_upstream_json(api_url, referer):
    req = urllib_request.Request(
        api_url,
        headers={
            "Accept": "application/json,text/plain,*/*",
            "Referer": referer,
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
        },
    )
    with urllib_request.urlopen(req, timeout=12) as response:
        raw = response.read(2 * 1024 * 1024)
    return json.loads(raw.decode("utf-8-sig"))


def normalize_sector_quote(item, sector_type):
    if not isinstance(item, dict):
        return None
    sector_id = sanitize(item.get("f12"), 64)
    sector_name = sanitize(item.get("f14"), 128)
    if not sector_id or not sector_name:
        return None

    change_pct = item.get("f3")
    try:
        change_pct = float(change_pct)
    except Exception:
        change_pct = None

    net_inflow = item.get("f62")
    try:
        net_inflow = int(float(net_inflow))
    except Exception:
        net_inflow = None

    return {
        "id": f"{sector_type}:{sector_id}",
        "sector_type": sector_type,
        "sector_id": sector_id,
        "sector_name": sector_name,
        "update_frequency": "realtime",
        "net_inflow": net_inflow,
        "change_pct": change_pct,
        "update_at": datetime.now(get_tz()).isoformat(),
    }


def fetch_hot_sectors(handler, parsed):
    params = parse_qs(parsed.query)
    requested_type = sanitize(params.get("type", ["all"])[0], 16)
    page_size = bounded_int(params.get("pageSize", [80])[0], 80, 1, 100)

    sector_sources = {
        "industry": {
            "hosts": ["push2delay.eastmoney.com", "push2.eastmoney.com"],
            "fs": "m:90+t:2",
        },
        "concept": {
            "hosts": ["push2delay.eastmoney.com", "push2.eastmoney.com"],
            "fs": "m:90+t:3",
        },
    }
    sector_types = list(sector_sources) if requested_type not in sector_sources else [requested_type]
    data = []
    errors = []

    for sector_type in sector_types:
        source = sector_sources[sector_type]
        query = urlencode(
            {
                "pn": 1,
                "pz": page_size,
                "po": 1,
                "np": 1,
                "fltt": 2,
                "invt": 2,
                "fid": "f3",
                "fs": source["fs"],
                "fields": "f12,f14,f3,f62",
            }
        )
        last_error = None
        for host in source["hosts"]:
            api_url = f"https://{host}/api/qt/clist/get?{query}"
            try:
                upstream_data = fetch_upstream_json(api_url, "https://quote.eastmoney.com/center/boardlist.html")
                diff = upstream_data.get("data", {}).get("diff") if isinstance(upstream_data, dict) else None
                if not isinstance(diff, list):
                    raise ValueError("东方财富接口返回格式异常")
                data.extend(filter(None, (normalize_sector_quote(item, sector_type) for item in diff)))
                last_error = None
                break
            except urllib_error.HTTPError as err:
                last_error = f"{sector_type}:{host}:{err.code}"
            except Exception as err:
                last_error = f"{sector_type}:{host}:{sanitize(err, 120)}"
        if last_error:
            errors.append(last_error)

    if not data:
        json_response(
            handler,
            {"success": False, "error": "热门板块接口请求失败", "details": errors},
            HTTPStatus.BAD_GATEWAY,
        )
        return

    json_response(handler, {"success": True, "data": data, "warnings": errors})


def fetch_registered_users_for_admin(handler, parsed):
    params = parse_qs(parsed.query)
    page = bounded_int(params.get("page", [1])[0], 1, 1, 10000)
    per_page = bounded_int(
        params.get("perPage", [REGISTERED_USERS_PAGE_SIZE])[0],
        REGISTERED_USERS_PAGE_SIZE,
        10,
        100,
    )
    try:
        result = fetch_registered_users_listing(page, per_page)
    except urllib_error.HTTPError as err:
        if err.code in {401, 403}:
            message = "SUPABASE_SERVICE_ROLE_KEY 无权限"
        else:
            message = f"客户邮箱读取失败 ({err.code})"
        json_response(handler, {"ok": False, "error": message}, HTTPStatus.BAD_GATEWAY)
        return
    except Exception as err:
        json_response(
            handler,
            {"ok": False, "error": f"客户邮箱读取失败: {sanitize(err, 160)}"},
            HTTPStatus.BAD_GATEWAY,
        )
        return

    if not result.get("configured"):
        json_response(handler, {"ok": False, **result}, HTTPStatus.SERVICE_UNAVAILABLE)
        return
    json_response(handler, {"ok": True, **result})


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
    body.modal-open { overflow: hidden; }
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
    .toolbar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin: 0; }
    input, button {
      height: 40px;
      border-radius: 8px;
      border: 1px solid var(--border);
      padding: 0 12px;
      font: inherit;
    }
    input { min-width: min(360px, 80vw); background: #fff; color: var(--text); }
    #username { min-width: min(220px, 80vw); }
    #password { min-width: min(280px, 80vw); }
    button { cursor: pointer; background: var(--text); color: #fff; font-weight: 650; }
    button.secondary { background: #fff; color: var(--text); }
    .status { color: var(--muted); font-size: 13px; }
    .header-actions { display: flex; align-items: center; gap: 10px; }
    .modal[hidden] { display: none; }
    .modal {
      position: fixed;
      inset: 0;
      z-index: 20;
      display: grid;
      place-items: center;
      padding: 20px;
    }
    .modal-backdrop { position: absolute; inset: 0; background: rgba(15, 23, 42, .38); }
    .modal-dialog {
      position: relative;
      width: min(420px, 100%);
      padding: 24px;
      border: 1px solid var(--border);
      border-radius: 10px;
      background: var(--panel);
      box-shadow: 0 24px 70px rgba(15, 23, 42, .24);
    }
    .modal-dialog h2 { margin: 0; font-size: 18px; }
    .modal-dialog p { margin: 6px 0 18px; color: var(--muted); font-size: 13px; }
    .modal-close {
      position: absolute;
      top: 12px;
      right: 12px;
      width: 32px;
      height: 32px;
      padding: 0;
      border: 0;
      background: transparent;
      color: var(--muted);
      font-size: 22px;
      line-height: 1;
    }
    .modal-close:hover { background: #f1f5f9; color: var(--text); }
    .modal-form { display: grid; gap: 12px; }
    .modal-form input { width: 100%; min-width: 0; }
    .modal-form button[type="submit"] { width: 100%; }
    .login-error { min-height: 20px; color: var(--rose); font-size: 13px; }
    .metrics {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
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
    .value.small { font-size: 18px; line-height: 1.25; }
    .sub { margin-top: 6px; color: var(--muted); font-size: 12px; }
    .blue { color: var(--blue); } .green { color: var(--green); } .rose { color: var(--rose); }
    .amber { color: var(--amber); } .violet { color: var(--violet); }
    .grid { display: grid; grid-template-columns: 2fr 1fr; gap: 12px; margin-top: 12px; }
    .panel { padding: 16px; min-width: 0; }
    .panel h2 { margin: 0; font-size: 15px; }
    .panel-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
    .chart-meta { margin-top: 3px; color: var(--muted); font-size: 12px; }
    .chart-range {
      display: inline-flex;
      flex: 0 0 auto;
      padding: 3px;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: #f8fafc;
    }
    .chart-range button {
      height: 30px;
      padding: 0 11px;
      border: 0;
      border-radius: 6px;
      background: transparent;
      color: var(--muted);
      font-size: 12px;
      font-weight: 650;
    }
    .chart-range button.active { background: var(--text); color: #fff; }
    .chart-legend { display: flex; align-items: center; gap: 16px; margin-top: 14px; color: var(--muted); font-size: 12px; }
    .chart-legend span { display: inline-flex; align-items: center; gap: 6px; }
    .chart-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--blue); }
    .chart-dot.uv { background: var(--green); }
    .chart-wrap { position: relative; width: 100%; min-height: 300px; margin-top: 4px; }
    .traffic-chart { display: block; width: 100%; height: 300px; overflow: visible; touch-action: pan-y; }
    .chart-grid-line { stroke: #e5eaf1; stroke-width: 1; }
    .chart-axis-label { fill: var(--muted); font-size: 11px; }
    .chart-line { fill: none; stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round; }
    .chart-line.pv { stroke: var(--blue); }
    .chart-line.uv { stroke: var(--green); }
    .chart-crosshair { stroke: #94a3b8; stroke-width: 1; stroke-dasharray: 4 4; opacity: 0; }
    .chart-focus-dot { stroke: #fff; stroke-width: 2; opacity: 0; }
    .chart-focus-dot.pv { fill: var(--blue); }
    .chart-focus-dot.uv { fill: var(--green); }
    .chart-tooltip {
      position: absolute;
      z-index: 2;
      display: flex;
      min-width: 132px;
      padding: 9px 10px;
      flex-direction: column;
      gap: 3px;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: rgba(255, 255, 255, .96);
      box-shadow: 0 10px 28px rgba(15, 23, 42, .14);
      opacity: 0;
      pointer-events: none;
      transform: translate(-50%, -100%);
      transition: opacity .12s ease;
    }
    .chart-tooltip.visible { opacity: 1; }
    .chart-tooltip strong { font-size: 12px; }
    .chart-tooltip span { color: var(--muted); font-size: 12px; }
    .chart-tooltip .pv-value { color: var(--blue); }
    .chart-tooltip .uv-value { color: var(--green); }
    .chart-empty { fill: var(--muted); font-size: 13px; text-anchor: middle; }
    .geo-grid { grid-template-columns: 2fr 1fr; }
    .geo-panel { overflow: hidden; }
    .geo-map-meta { margin-top: 3px; color: var(--muted); font-size: 12px; }
    .world-map {
      position: relative;
      width: 100%;
      aspect-ratio: 2 / 1;
      margin-top: 14px;
      overflow: hidden;
      border: 1px solid #c8dff5;
      border-radius: 8px;
      background: #edf7ff;
      box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .72);
    }
    .world-map svg { display: block; width: 100%; height: 100%; }
    .map-grid { fill: none; stroke: #cce2f4; stroke-width: 1; opacity: .86; }
    .map-equator { fill: none; stroke: #a8cae9; stroke-width: 1.2; stroke-dasharray: 5 5; }
    .map-land { fill: #dcebd9; stroke: #a9c8ae; stroke-width: 1.1; stroke-linejoin: round; fill-rule: evenodd; }
    .map-label { fill: #7d99af; font-size: 15px; font-weight: 650; letter-spacing: 0; opacity: .88; text-anchor: middle; }
    .geo-points { position: absolute; inset: 0; }
    .geo-point {
      position: absolute;
      z-index: 2;
      display: grid;
      width: 32px;
      height: 32px;
      place-items: center;
      padding: 0;
      border: 0;
      border-radius: 50%;
      background: transparent;
      color: var(--text);
      transform: translate(-50%, -50%);
    }
    .geo-point-dot {
      display: block;
      width: var(--size, 10px);
      height: var(--size, 10px);
      max-width: 24px;
      max-height: 24px;
      border: 2px solid #fff;
      border-radius: 50%;
      background: #e45b47;
      box-shadow: 0 2px 8px rgba(190, 60, 40, .45);
      transition: transform .14s ease, background .14s ease;
    }
    .geo-point:hover .geo-point-dot, .geo-point:focus-visible .geo-point-dot { transform: scale(1.28); background: #b91c1c; }
    .geo-point-tooltip {
      position: absolute;
      z-index: 3;
      bottom: calc(100% + 5px);
      left: 50%;
      display: none;
      width: max-content;
      max-width: 210px;
      padding: 8px 10px;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: rgba(255, 255, 255, .98);
      box-shadow: 0 10px 24px rgba(15, 23, 42, .16);
      color: var(--text);
      font-size: 12px;
      line-height: 1.4;
      text-align: left;
      transform: translateX(-50%);
      pointer-events: none;
    }
    .geo-point:hover .geo-point-tooltip, .geo-point:focus-visible .geo-point-tooltip { display: block; }
    .geo-point-tooltip span { display: block; color: var(--muted); }
    .map-empty {
      position: absolute;
      inset: 0;
      z-index: 1;
      display: grid;
      place-items: center;
      padding: 24px;
      color: var(--muted);
      font-size: 13px;
      text-align: center;
      pointer-events: none;
    }
    .map-empty.hidden { display: none; }
    .page-analytics-grid { grid-template-columns: minmax(280px, 1fr) minmax(0, 1.35fr); }
    .email-panel { margin-top: 12px; }
    .email-table-scroll { max-height: 360px; }
    .email-table td:first-child { min-width: 220px; }
    .email-status { margin-top: 4px; color: var(--muted); font-size: 12px; }
    .pagination { display: flex; align-items: center; justify-content: flex-end; gap: 8px; margin-top: 12px; }
    .pagination button { height: 34px; padding: 0 11px; font-size: 12px; }
    .pagination button:disabled { cursor: not-allowed; opacity: .45; }
    .source-analysis-grid { grid-template-columns: minmax(0, 1.5fr) minmax(280px, 1fr); }
    .source-range { display: inline-flex; gap: 4px; }
    .source-range button { height: 30px; padding: 0 10px; border-radius: 6px; font-size: 12px; }
    .source-range button.active { background: var(--text); color: #fff; }
    .source-summary { display: flex; gap: 18px; margin: 14px 0 8px; color: var(--muted); font-size: 12px; }
    .source-summary strong { color: var(--text); font-size: 16px; }
    .source-channel { font-weight: 650; }
    .source-detail { color: var(--muted); font-size: 12px; }
    .source-share { min-width: 110px; }
    .source-share-track { display: inline-block; width: 64px; height: 6px; margin-right: 6px; vertical-align: middle; overflow: hidden; border-radius: 3px; background: #e8edf4; }
    .source-share-track i { display: block; height: 100%; border-radius: inherit; background: var(--blue); }
    .table-scroll { max-height: 390px; overflow: auto; }
    .table-scroll thead { position: sticky; top: 0; z-index: 1; background: var(--panel); }
    .page-path { max-width: 360px; word-break: break-all; }
    .page-selector { display: flex; align-items: center; gap: 8px; color: var(--muted); font-size: 12px; }
    select {
      max-width: min(280px, 52vw);
      height: 34px;
      padding: 0 28px 0 9px;
      border: 1px solid var(--border);
      border-radius: 7px;
      background: #fff;
      color: var(--text);
      font: inherit;
    }
    .page-chart-wrap { min-height: 280px; }
    .page-chart { height: 280px; }
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
      .panel-heading { align-items: stretch; flex-direction: column; gap: 10px; }
      .chart-range { width: 100%; }
      .chart-range button { flex: 1; }
      .chart-wrap { min-height: 250px; }
      .traffic-chart { height: 250px; }
      .page-chart-wrap { min-height: 250px; }
      .page-chart { height: 250px; }
      .page-selector { align-items: stretch; flex-direction: column; }
      select { max-width: none; width: 100%; }
      .geo-point-tooltip { left: auto; right: 0; transform: none; }
      .source-summary { gap: 12px; flex-wrap: wrap; }
      .email-table td:first-child { min-width: 170px; }
    }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>估基运营管理台</h1>
      <div class="status" id="status">等待加载</div>
    </div>
    <div class="header-actions">
      <button type="button" id="openLogin">管理员登录</button>
      <button type="button" class="secondary" id="refresh">刷新</button>
    </div>
  </header>
  <div class="modal" id="loginModal" role="dialog" aria-modal="true" aria-labelledby="loginTitle">
    <div class="modal-backdrop" id="loginBackdrop"></div>
    <div class="modal-dialog">
      <button type="button" class="modal-close" id="closeLogin" aria-label="关闭登录窗口">&times;</button>
      <h2 id="loginTitle">管理员登录</h2>
      <p>登录后查看页面访问、PV/UV 趋势和其他运营数据。</p>
      <form class="modal-form" id="loginForm">
        <input id="username" name="username" type="text" autocomplete="username" placeholder="管理员账号" required>
        <input id="password" name="password" type="password" autocomplete="current-password" placeholder="管理员密码" required>
        <div class="login-error" id="loginError" role="alert"></div>
        <button type="submit" id="save">登录并查看数据</button>
      </form>
    </div>
  </div>
  <main>
    <section class="metrics">
      <div class="metric"><div class="label">当前客户量</div><div class="value blue" id="active">0</div><div class="sub">最近 5 分钟活跃 UV</div></div>
      <div class="metric"><div class="label">今日 PV</div><div class="value green" id="todayPv">0</div><div class="sub">今日 UV <span id="todayUv">0</span></div></div>
      <div class="metric"><div class="label">7 日 PV</div><div class="value violet" id="weekPv">0</div><div class="sub">7 日 UV <span id="weekUv">0</span></div></div>
      <div class="metric"><div class="label">本月 PV</div><div class="value amber" id="monthPv">0</div><div class="sub">本月 UV <span id="monthUv">0</span></div></div>
      <div class="metric"><div class="label">活跃会话</div><div class="value rose" id="sessions">0</div><div class="sub">最近 30 分钟</div></div>
      <div class="metric"><div class="label">累计客户</div><div class="value" id="totalVisitors">0</div><div class="sub">今日新客 <span id="newToday">0</span></div></div>
      <div class="metric"><div class="label">已注册客户</div><div class="value blue" id="registeredUsers">0</div><div class="sub" id="registeredUsersSub">邮箱注册账号</div></div>
    </section>

    <section class="grid">
      <div class="panel">
        <div class="panel-heading">
          <div>
            <h2>PV / UV 访问趋势</h2>
            <div class="chart-meta" id="chartMeta">最近 24 小时 · 按小时统计</div>
          </div>
          <div class="chart-range" role="group" aria-label="趋势时间范围">
            <button type="button" class="active" data-chart-range="hourly" aria-pressed="true">24 小时</button>
            <button type="button" data-chart-range="daily" aria-pressed="false">30 天</button>
          </div>
        </div>
        <div class="chart-legend" aria-hidden="true">
          <span><i class="chart-dot"></i>PV 访问量</span>
          <span><i class="chart-dot uv"></i>UV 访客量</span>
        </div>
        <div class="chart-wrap" id="trafficChartWrap">
          <svg class="traffic-chart" id="trafficChart" role="img" aria-label="PV 和 UV 访问趋势"></svg>
          <div class="chart-tooltip" id="chartTooltip">
            <strong id="chartTooltipLabel"></strong>
            <span class="pv-value" id="chartTooltipPv"></span>
            <span class="uv-value" id="chartTooltipUv"></span>
          </div>
        </div>
      </div>
      <div class="panel">
        <h2>Top 页面</h2>
        <table><thead><tr><th>页面</th><th>PV</th><th>UV</th></tr></thead><tbody id="topPages"></tbody></table>
      </div>
    </section>

    <section class="grid page-analytics-grid">
      <div class="panel">
        <div class="panel-heading">
          <div>
            <h2>页面访问</h2>
            <div class="chart-meta" id="pageTodayMeta">今日各页面 PV / UV</div>
          </div>
        </div>
        <div class="table-scroll">
          <table><thead><tr><th>页面</th><th>PV</th><th>UV</th></tr></thead><tbody id="pageToday"></tbody></table>
        </div>
      </div>
      <div class="panel">
        <div class="panel-heading">
          <div>
            <h2>页面访问趋势</h2>
            <div class="chart-meta" id="pageChartMeta">最近 30 天 · 请选择页面</div>
          </div>
          <label class="page-selector">页面
            <select id="pageTrendSelect" aria-label="选择页面"></select>
          </label>
        </div>
        <div class="chart-legend" aria-hidden="true">
          <span><i class="chart-dot"></i>PV 访问量</span>
          <span><i class="chart-dot uv"></i>UV 访客量</span>
        </div>
        <div class="chart-wrap page-chart-wrap" id="pageChartWrap">
          <svg class="traffic-chart page-chart" id="pageChart" role="img" aria-label="页面 PV 和 UV 访问趋势"></svg>
          <div class="chart-tooltip" id="pageChartTooltip">
            <strong id="pageChartTooltipLabel"></strong>
            <span class="pv-value" id="pageChartTooltipPv"></span>
            <span class="uv-value" id="pageChartTooltipUv"></span>
          </div>
        </div>
      </div>
    </section>

    <section class="grid geo-grid">
      <div class="panel geo-panel">
        <div class="panel-heading">
          <div>
            <h2>7 日访问地图</h2>
            <div class="geo-map-meta" id="geoMapMeta">等待定位数据</div>
          </div>
        </div>
        <div class="world-map" id="worldMap">
          <svg id="worldMapSvg" viewBox="0 0 1200 600" preserveAspectRatio="none" role="img" aria-label="全球访问分布地图">
            <path class="map-grid" d="M0 100H1200 M0 200H1200 M0 300H1200 M0 400H1200 M0 500H1200 M100 0V600 M200 0V600 M300 0V600 M400 0V600 M500 0V600 M600 0V600 M700 0V600 M800 0V600 M900 0V600 M1000 0V600 M1100 0V600" />
            <path class="map-equator" d="M0 300H1200" />
            <path class="map-land" id="worldLand" />
            <g class="map-label" aria-hidden="true"><text x="270" y="205">北美洲</text><text x="385" y="410">南美洲</text><text x="590" y="210">欧洲</text><text x="575" y="365">非洲</text><text x="810" y="235">亚洲</text><text x="970" y="415">大洋洲</text></g>
          </svg>
          <div class="geo-points" id="geoPoints"></div>
          <div class="map-empty" id="geoMapEmpty">访问发生后将在这里显示地区分布</div>
        </div>
      </div>
      <div class="panel">
        <h2>访问地区</h2>
        <table><thead><tr><th>地区</th><th>PV</th><th>UV</th><th>IP</th></tr></thead><tbody id="topLocations"></tbody></table>
      </div>
    </section>

    <section class="panel email-panel">
      <div class="panel-heading">
        <div>
          <h2>已注册客户邮箱</h2>
          <div class="email-status" id="emailStatus">登录后分页读取 Supabase Auth 中的邮箱账号</div>
        </div>
        <div class="pagination" style="margin-top:0">
          <button type="button" class="secondary" id="emailPrev" disabled>上一页</button>
          <span class="status" id="emailPageLabel">第 1 页</span>
          <button type="button" class="secondary" id="emailNext" disabled>下一页</button>
        </div>
      </div>
      <div class="table-scroll email-table-scroll">
        <table class="email-table"><thead><tr><th>邮箱</th><th>注册时间</th><th>最近登录</th><th>邮箱状态</th></tr></thead><tbody id="registeredUserRows"><tr><td colspan="4" class="empty">登录后加载</td></tr></tbody></table>
      </div>
    </section>

    <section class="grid source-analysis-grid">
      <div class="panel">
        <div class="panel-heading">
          <div>
            <h2>页面来源分析</h2>
            <div class="chart-meta" id="sourceMeta">最近 7 天 · 按来源渠道统计</div>
          </div>
          <div class="source-range" role="group" aria-label="来源分析时间范围">
            <button type="button" class="active" data-source-range="sevenDays" aria-pressed="true">7 天</button>
            <button type="button" class="secondary" data-source-range="month" aria-pressed="false">30 天</button>
          </div>
        </div>
        <div class="source-summary"><span>PV <strong id="sourcePv">0</strong></span><span>UV <strong id="sourceUv">0</strong></span></div>
        <div class="table-scroll">
          <table><thead><tr><th>渠道</th><th>来源 / 媒介</th><th>活动</th><th>主要落地页</th><th>PV</th><th>UV</th><th>占比</th></tr></thead><tbody id="sourceAnalyticsRows"></tbody></table>
        </div>
      </div>
      <div class="panel">
        <h2>来源说明</h2>
        <div class="chart-meta" style="margin-top:8px">带 UTM 的推广链接会优先按来源、媒介和活动统计；历史访问继续按浏览器来源归类。</div>
        <table style="margin-top:10px"><thead><tr><th>渠道</th><th>识别规则</th></tr></thead><tbody>
          <tr><td>搜索</td><td>Google、百度、Bing 等搜索引擎</td></tr>
          <tr><td>社交</td><td>微信、微博、抖音、小红书、知乎、QQ</td></tr>
          <tr><td>直接访问</td><td>没有浏览器来源页的访问</td></tr>
          <tr><td>外部网站</td><td>其他站点带来的访问</td></tr>
        </tbody></table>
      </div>
    </section>

    <section class="grid">
      <div class="panel">
        <h2>最近访问</h2>
        <table><thead><tr><th>时间</th><th>事件</th><th>页面</th></tr></thead><tbody id="latest"></tbody></table>
      </div>
      <div class="panel">
        <h2>最近来源明细</h2>
        <table><thead><tr><th>来源</th><th>PV</th></tr></thead><tbody id="topReferrers"></tbody></table>
      </div>
    </section>
  </main>
  <script>
    const $ = (id) => document.getElementById(id);
    const fmt = (n) => Number(n || 0).toLocaleString('zh-CN');
    const usernameInput = $('username');
    const passwordInput = $('password');
    let timer = null;
    let chartResizeFrame = null;
    const chartState = {
      range: 'hourly',
      series: { hourly: [], daily: [] },
      rows: [],
      width: 0,
      height: 0,
      points: { pv: [], uv: [] }
    };
    const pageChartState = {
      selected: '',
      trend: { pages: [], series: [] },
      rows: [],
      width: 0,
      height: 0,
      points: { pv: [], uv: [] }
    };
    const emailState = { page: 1, perPage: 20, hasMore: false, total: null };
    const sourceState = { range: 'sevenDays', data: { sevenDays: {}, month: {} } };
    let emailLoaded = false;

    function setStatus(text) { $('status').textContent = text; }
    function formatDate(value) {
      if (!value) return '-';
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString('zh-CN');
    }
    function setLoginModal(open) {
      $('loginModal').hidden = !open;
      document.body.classList.toggle('modal-open', open);
      if (open) window.setTimeout(() => usernameInput.focus(), 0);
    }
    function setLoginError(text) { $('loginError').textContent = text || ''; }
    function setRows(id, rows, render, colspan = 3) {
      const el = $(id);
      el.innerHTML = rows.length ? rows.map(render).join('') : `<tr><td colspan="${colspan}" class="empty">暂无数据</td></tr>`;
    }
    function setLocationRows(rows) {
      const el = $('topLocations');
      el.innerHTML = rows.length ? rows.map((x) => {
        const city = x.city && x.city !== '城市级区域' ? ` · ${x.city}` : '';
        return `<tr><td>${escapeHtml(`${x.country || '未知地区'}${city}`)}</td><td>${fmt(x.pv)}</td><td>${fmt(x.uv)}</td><td>${fmt(x.ips)}</td></tr>`;
      }).join('') : '<tr><td colspan="4" class="empty">暂无数据</td></tr>';
    }
    function escapeHtml(s) {
      return String(s || '').replace(/[&<>"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
    }
    function renderRegisteredUsers(payload) {
      const users = Array.isArray(payload?.users) ? payload.users : [];
      emailState.page = Number(payload?.page || 1);
      emailState.perPage = Number(payload?.perPage || 20);
      emailState.hasMore = Boolean(payload?.hasMore);
      emailState.total = payload?.total ?? null;
      setRows('registeredUserRows', users, (user) => `<tr><td>${escapeHtml(user.email)}</td><td>${formatDate(user.createdAt)}</td><td>${formatDate(user.lastSignInAt)}</td><td>${user.emailConfirmed ? '已验证' : '待验证'}</td></tr>`, 4);
      $('emailPrev').disabled = emailState.page <= 1;
      $('emailNext').disabled = !emailState.hasMore;
      $('emailPageLabel').textContent = emailState.total == null
        ? `第 ${emailState.page} 页`
        : `第 ${emailState.page} 页 · 共 ${fmt(emailState.total)} 个账号`;
      $('emailStatus').textContent = users.length
        ? `当前页 ${users.length} 个邮箱 · 数据来自 Supabase Auth`
        : (payload?.error || '暂无邮箱账号');
    }
    async function loadRegisteredUsers(page = emailState.page) {
      const username = usernameInput.value.trim();
      const password = passwordInput.value;
      if (!username || !password) return;
      $('emailStatus').textContent = '正在加载客户邮箱...';
      try {
        const res = await fetch(`/api/analytics/registered-users?page=${encodeURIComponent(page)}&perPage=${emailState.perPage}`, {
          headers: { 'X-Admin-Username': username, 'X-Admin-Password': password }
        });
        const payload = await res.json();
        if (!res.ok) {
          $('emailStatus').textContent = payload.error || `邮箱加载失败 ${res.status}`;
          return;
        }
        renderRegisteredUsers(payload);
      } catch (error) {
        $('emailStatus').textContent = '邮箱加载失败，请检查网络连接';
      }
    }
    function renderSourceAnalytics() {
      const data = sourceState.data[sourceState.range] || {};
      const rows = Array.isArray(data.rows) ? data.rows : [];
      const label = sourceState.range === 'month' ? '最近 30 天' : '最近 7 天';
      $('sourceMeta').textContent = `${label} · 按来源渠道统计`;
      $('sourcePv').textContent = fmt(data.pv);
      $('sourceUv').textContent = fmt(data.uv);
      setRows('sourceAnalyticsRows', rows, (row) => `<tr><td class="source-channel">${escapeHtml(row.channel)}</td><td class="source-detail">${escapeHtml(row.detail)}</td><td class="source-detail">${escapeHtml(row.campaign || '-')}</td><td class="page-path">${escapeHtml(row.topPath)}</td><td>${fmt(row.pv)}</td><td>${fmt(row.uv)}</td><td class="source-share"><span class="source-share-track"><i style="width:${Math.min(100, Number(row.share || 0))}%"></i></span>${Number(row.share || 0).toFixed(1)}%</td></tr>`, 7);
    }
    function selectSourceRange(range) {
      if (!['sevenDays', 'month'].includes(range)) return;
      sourceState.range = range;
      document.querySelectorAll('[data-source-range]').forEach((button) => {
        const active = button.dataset.sourceRange === range;
        button.classList.toggle('active', active);
        button.classList.toggle('secondary', !active);
        button.setAttribute('aria-pressed', String(active));
      });
      renderSourceAnalytics();
    }
    let worldMapLoadPromise = null;
    function projectWorldCoordinate(point) {
      const longitude = Number(point[0]);
      const latitude = Number(point[1]);
      if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
      return {
        x: ((longitude + 180) / 360) * 1200,
        y: ((90 - latitude) / 180) * 600,
        longitude
      };
    }
    function worldRingPath(ring) {
      let path = '';
      let previous = null;
      for (const point of ring || []) {
        const projected = projectWorldCoordinate(point);
        if (!projected) continue;
        const crossesDateLine = previous && Math.abs(projected.longitude - previous.longitude) > 180;
        path += !previous || crossesDateLine
          ? `M ${projected.x.toFixed(2)} ${projected.y.toFixed(2)}`
          : ` L ${projected.x.toFixed(2)} ${projected.y.toFixed(2)}`;
        previous = projected;
      }
      return path ? `${path} Z` : '';
    }
    function worldGeometryPath(geometry) {
      if (!geometry) return '';
      const polygons = geometry.type === 'Polygon'
        ? [geometry.coordinates]
        : geometry.type === 'MultiPolygon'
          ? geometry.coordinates
          : [];
      return polygons.map((polygon) => polygon.map(worldRingPath).join('')).join('');
    }
    function loadWorldMap() {
      if (worldMapLoadPromise) return worldMapLoadPromise;
      worldMapLoadPromise = fetch('/assets/world-land.json', { cache: 'force-cache' })
        .then((response) => {
          if (!response.ok) throw new Error(`world map ${response.status}`);
          return response.json();
        })
        .then((data) => {
          const path = (data.features || []).map((feature) => worldGeometryPath(feature.geometry)).join('');
          if (!path) throw new Error('world map is empty');
          $('worldLand').setAttribute('d', path);
        })
        .catch(() => {
          worldMapLoadPromise = null;
        });
      return worldMapLoadPromise;
    }
    function renderGeoMap(geo) {
      loadWorldMap();
      const data = geo || {};
      const points = Array.isArray(data.points) ? data.points : [];
      const layer = $('geoPoints');
      const empty = $('geoMapEmpty');
      const totalIps = Number(data.totalIps || 0);
      const locatedIps = Number(data.locatedIps || 0);
      $('geoMapMeta').textContent = data.available
        ? `已定位 ${fmt(locatedIps)} / ${fmt(totalIps)} 个独立 IP · 按城市/区域汇总`
        : '本地 GeoIP 数据库未就绪';
      setLocationRows(Array.isArray(data.topLocations) ? data.topLocations : points.slice(0, 10));

      const validPoints = points.filter((point) => {
        const lat = Number(point.lat);
        const lng = Number(point.lng);
        return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
      });
      layer.innerHTML = validPoints.map((point) => {
        const lat = Number(point.lat);
        const lng = Number(point.lng);
        const left = Math.max(1.5, Math.min(98.5, ((lng + 180) / 360) * 100));
        const top = Math.max(2.5, Math.min(97.5, ((90 - lat) / 180) * 100));
        const pv = Number(point.pv || 0);
        const size = Math.max(9, Math.min(24, 8 + Math.sqrt(Math.max(1, pv)) * 2.2));
        const city = point.city && point.city !== '城市级区域' ? ` · ${point.city}` : '';
        const label = `${point.country || '未知地区'}${city}`;
        return `<button type="button" class="geo-point" style="left:${left.toFixed(3)}%;top:${top.toFixed(3)}%;--size:${size.toFixed(1)}px" aria-label="${escapeHtml(`${label}: PV ${fmt(point.pv)}, UV ${fmt(point.uv)}, IP ${fmt(point.ips)}`)}"><i class="geo-point-dot"></i><span class="geo-point-tooltip"><strong>${escapeHtml(label)}</strong><span>PV ${fmt(point.pv)} · UV ${fmt(point.uv)} · ${fmt(point.ips)} IP</span></span></button>`;
      }).join('');
      if (validPoints.length) {
        empty.classList.add('hidden');
      } else {
        empty.textContent = data.available
          ? '地图从本次上线后开始积累，新的访问会自动出现'
          : '本地 GeoIP 数据库未就绪';
        empty.classList.remove('hidden');
      }
    }
    function niceMax(value) {
      if (!Number.isFinite(value) || value <= 0) return 1;
      const magnitude = 10 ** Math.floor(Math.log10(value));
      const normalized = value / magnitude;
      const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
      return step * magnitude;
    }
    function smoothPath(points) {
      if (!points.length) return '';
      if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
      let path = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
      for (let index = 1; index < points.length; index += 1) {
        const previous = points[index - 1];
        const current = points[index];
        const middleX = (previous.x + current.x) / 2;
        path += ` C ${middleX.toFixed(2)} ${previous.y.toFixed(2)}, ${middleX.toFixed(2)} ${current.y.toFixed(2)}, ${current.x.toFixed(2)} ${current.y.toFixed(2)}`;
      }
      return path;
    }
    function renderChart() {
      const wrap = $('trafficChartWrap');
      const svg = $('trafficChart');
      const rows = chartState.series[chartState.range] || [];
      const width = Math.max(300, Math.round(wrap.clientWidth || 720));
      const height = width < 560 ? 250 : 300;
      const padding = { top: 18, right: 16, bottom: 34, left: 44 };
      const plotWidth = width - padding.left - padding.right;
      const plotHeight = height - padding.top - padding.bottom;

      chartState.rows = rows;
      chartState.width = width;
      chartState.height = height;
      svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

      if (!rows.length) {
        chartState.points = { pv: [], uv: [] };
        svg.innerHTML = `<text class="chart-empty" x="${width / 2}" y="${height / 2}">暂无趋势数据</text>`;
        return;
      }

      const maxValue = niceMax(Math.max(...rows.flatMap((row) => [Number(row.pv || 0), Number(row.uv || 0)])));
      const xAt = (index) => padding.left + (rows.length === 1 ? plotWidth / 2 : (index / (rows.length - 1)) * plotWidth);
      const yAt = (value) => padding.top + plotHeight - (Number(value || 0) / maxValue) * plotHeight;
      const pvPoints = rows.map((row, index) => ({ x: xAt(index), y: yAt(row.pv) }));
      const uvPoints = rows.map((row, index) => ({ x: xAt(index), y: yAt(row.uv) }));
      chartState.points = { pv: pvPoints, uv: uvPoints };

      const gridLines = [];
      for (let index = 0; index <= 4; index += 1) {
        const value = (maxValue * index) / 4;
        const y = yAt(value);
        gridLines.push(`<line class="chart-grid-line" x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}"></line>`);
        gridLines.push(`<text class="chart-axis-label" x="${padding.left - 8}" y="${y + 4}" text-anchor="end">${escapeHtml(fmt(value))}</text>`);
      }

      const labelEvery = rows.length > 24 ? 5 : rows.length > 12 ? 4 : 1;
      const xLabels = rows.map((row, index) => {
        if (index !== 0 && index !== rows.length - 1 && index % labelEvery !== 0) return '';
        return `<text class="chart-axis-label" x="${xAt(index)}" y="${height - 9}" text-anchor="middle">${escapeHtml(row.label)}</text>`;
      }).join('');
      const description = rows.map((row) => `${row.date || row.label} PV ${fmt(row.pv)} UV ${fmt(row.uv)}`).join('；');

      svg.innerHTML = `
        <title>${chartState.range === 'hourly' ? '最近 24 小时' : '最近 30 天'} PV 和 UV 访问趋势</title>
        <desc>${escapeHtml(description)}</desc>
        ${gridLines.join('')}
        ${xLabels}
        <path class="chart-line pv" d="${smoothPath(pvPoints)}"></path>
        <path class="chart-line uv" d="${smoothPath(uvPoints)}"></path>
        <line class="chart-crosshair" id="chartCrosshair" y1="${padding.top}" y2="${padding.top + plotHeight}"></line>
        <circle class="chart-focus-dot pv" id="chartFocusPv" r="5"></circle>
        <circle class="chart-focus-dot uv" id="chartFocusUv" r="5"></circle>
      `;
    }
    function renderPageChart() {
      const wrap = $('pageChartWrap');
      const svg = $('pageChart');
      const rows = pageChartState.rows;
      const width = Math.max(300, Math.round(wrap.clientWidth || 600));
      const height = width < 560 ? 250 : 280;
      const padding = { top: 18, right: 16, bottom: 34, left: 44 };
      const plotWidth = width - padding.left - padding.right;
      const plotHeight = height - padding.top - padding.bottom;
      const selected = pageChartState.selected;
      const values = rows.map((row) => row.pages?.[selected] || { pv: 0, uv: 0 });

      pageChartState.width = width;
      pageChartState.height = height;
      svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
      if (!rows.length || !selected) {
        pageChartState.points = { pv: [], uv: [] };
        svg.innerHTML = '<text class="chart-empty" x="50%" y="50%">暂无页面趋势数据</text>';
        return;
      }

      const maxValue = niceMax(Math.max(...values.flatMap((row) => [Number(row.pv || 0), Number(row.uv || 0)])));
      const xAt = (index) => padding.left + (rows.length === 1 ? plotWidth / 2 : (index / (rows.length - 1)) * plotWidth);
      const yAt = (value) => padding.top + plotHeight - (Number(value || 0) / maxValue) * plotHeight;
      const pvPoints = values.map((row, index) => ({ x: xAt(index), y: yAt(row.pv) }));
      const uvPoints = values.map((row, index) => ({ x: xAt(index), y: yAt(row.uv) }));
      pageChartState.points = { pv: pvPoints, uv: uvPoints };

      const gridLines = [];
      for (let index = 0; index <= 4; index += 1) {
        const value = (maxValue * index) / 4;
        const y = yAt(value);
        gridLines.push(`<line class="chart-grid-line" x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}"></line>`);
        gridLines.push(`<text class="chart-axis-label" x="${padding.left - 8}" y="${y + 4}" text-anchor="end">${escapeHtml(fmt(value))}</text>`);
      }
      const labelEvery = rows.length > 24 ? 5 : rows.length > 12 ? 4 : 1;
      const xLabels = rows.map((row, index) => {
        if (index !== 0 && index !== rows.length - 1 && index % labelEvery !== 0) return '';
        return `<text class="chart-axis-label" x="${xAt(index)}" y="${height - 9}" text-anchor="middle">${escapeHtml(row.label)}</text>`;
      }).join('');
      const description = rows.map((row, index) => `${row.date || row.label} PV ${fmt(values[index].pv)} UV ${fmt(values[index].uv)}`).join('；');
      svg.innerHTML = `
        <title>${escapeHtml(`${selected} 最近 30 天 PV 和 UV 访问趋势`)}</title>
        <desc>${escapeHtml(description)}</desc>
        ${gridLines.join('')}
        ${xLabels}
        <path class="chart-line pv" d="${smoothPath(pvPoints)}"></path>
        <path class="chart-line uv" d="${smoothPath(uvPoints)}"></path>
        <line class="chart-crosshair" id="pageChartCrosshair" y1="${padding.top}" y2="${padding.top + plotHeight}"></line>
        <circle class="chart-focus-dot pv" id="pageChartFocusPv" r="5"></circle>
        <circle class="chart-focus-dot uv" id="pageChartFocusUv" r="5"></circle>
      `;
    }
    function showPageChartTooltip(event) {
      const rows = pageChartState.rows;
      if (!rows.length || !pageChartState.selected) return;
      const svg = $('pageChart');
      const rect = svg.getBoundingClientRect();
      const viewX = ((event.clientX - rect.left) / rect.width) * pageChartState.width;
      const left = 44;
      const right = 16;
      const plotWidth = pageChartState.width - left - right;
      const index = Math.max(0, Math.min(rows.length - 1, Math.round(((viewX - left) / plotWidth) * (rows.length - 1))));
      const row = rows[index];
      const values = row.pages?.[pageChartState.selected] || { pv: 0, uv: 0 };
      const pvPoint = pageChartState.points.pv[index];
      const uvPoint = pageChartState.points.uv[index];
      const crosshair = $('pageChartCrosshair');
      const pvDot = $('pageChartFocusPv');
      const uvDot = $('pageChartFocusUv');
      crosshair.setAttribute('x1', pvPoint.x);
      crosshair.setAttribute('x2', pvPoint.x);
      crosshair.style.opacity = '1';
      pvDot.setAttribute('cx', pvPoint.x);
      pvDot.setAttribute('cy', pvPoint.y);
      pvDot.style.opacity = '1';
      uvDot.setAttribute('cx', uvPoint.x);
      uvDot.setAttribute('cy', uvPoint.y);
      uvDot.style.opacity = '1';
      $('pageChartTooltipLabel').textContent = row.date || row.label;
      $('pageChartTooltipPv').textContent = `PV ${fmt(values.pv)}`;
      $('pageChartTooltipUv').textContent = `UV ${fmt(values.uv)}`;
      const tooltip = $('pageChartTooltip');
      const pointLeft = (pvPoint.x / pageChartState.width) * rect.width;
      const pointTop = (Math.min(pvPoint.y, uvPoint.y) / pageChartState.height) * rect.height;
      tooltip.style.left = `${Math.max(76, Math.min(rect.width - 76, pointLeft))}px`;
      tooltip.style.top = `${Math.max(58, pointTop - 8)}px`;
      tooltip.classList.add('visible');
    }
    function hidePageChartTooltip() {
      $('pageChartTooltip').classList.remove('visible');
      ['pageChartCrosshair', 'pageChartFocusPv', 'pageChartFocusUv'].forEach((id) => {
        const element = $(id);
        if (element) element.style.opacity = '0';
      });
    }
    function renderPageAnalytics(pageToday, pageTrend) {
      const todayRows = Array.isArray(pageToday) ? pageToday : [];
      const trend = pageTrend && typeof pageTrend === 'object' ? pageTrend : {};
      const pages = Array.isArray(trend.pages) ? trend.pages : [];
      const series = Array.isArray(trend.series) ? trend.series : [];
      setRows('pageToday', todayRows, (row) => `<tr><td class="page-path">${escapeHtml(row.path)}</td><td>${fmt(row.pv)}</td><td>${fmt(row.uv)}</td></tr>`);
      $('pageTodayMeta').textContent = todayRows.length ? `今日 ${fmt(todayRows.length)} 个页面有访问记录` : '今日各页面 PV / UV';

      const select = $('pageTrendSelect');
      const current = pages.includes(pageChartState.selected) ? pageChartState.selected : (pages[0] || '');
      select.innerHTML = pages.length
        ? pages.map((path) => `<option value="${escapeHtml(path)}">${escapeHtml(path)}</option>`).join('')
        : '<option value="">暂无页面</option>';
      select.value = current;
      select.disabled = !pages.length;
      pageChartState.selected = current;
      pageChartState.trend = { pages, series };
      pageChartState.rows = series;
      $('pageChartMeta').textContent = current ? `最近 30 天 · ${current}` : '最近 30 天 · 请选择页面';
      hidePageChartTooltip();
      renderPageChart();
    }
    function hideChartTooltip() {
      $('chartTooltip').classList.remove('visible');
      const crosshair = $('chartCrosshair');
      const pvDot = $('chartFocusPv');
      const uvDot = $('chartFocusUv');
      if (crosshair) crosshair.style.opacity = '0';
      if (pvDot) pvDot.style.opacity = '0';
      if (uvDot) uvDot.style.opacity = '0';
    }
    function showChartTooltip(event) {
      const rows = chartState.rows;
      if (!rows.length) return;
      const svg = $('trafficChart');
      const rect = svg.getBoundingClientRect();
      const viewX = ((event.clientX - rect.left) / rect.width) * chartState.width;
      const left = 44;
      const right = 16;
      const plotWidth = chartState.width - left - right;
      const index = Math.max(0, Math.min(rows.length - 1, Math.round(((viewX - left) / plotWidth) * (rows.length - 1))));
      const row = rows[index];
      const pvPoint = chartState.points.pv[index];
      const uvPoint = chartState.points.uv[index];
      const crosshair = $('chartCrosshair');
      const pvDot = $('chartFocusPv');
      const uvDot = $('chartFocusUv');

      crosshair.setAttribute('x1', pvPoint.x);
      crosshair.setAttribute('x2', pvPoint.x);
      crosshair.style.opacity = '1';
      pvDot.setAttribute('cx', pvPoint.x);
      pvDot.setAttribute('cy', pvPoint.y);
      pvDot.style.opacity = '1';
      uvDot.setAttribute('cx', uvPoint.x);
      uvDot.setAttribute('cy', uvPoint.y);
      uvDot.style.opacity = '1';

      $('chartTooltipLabel').textContent = row.date || row.label;
      $('chartTooltipPv').textContent = `PV ${fmt(row.pv)}`;
      $('chartTooltipUv').textContent = `UV ${fmt(row.uv)}`;
      const tooltip = $('chartTooltip');
      const pointLeft = (pvPoint.x / chartState.width) * rect.width;
      const pointTop = (Math.min(pvPoint.y, uvPoint.y) / chartState.height) * rect.height;
      tooltip.style.left = `${Math.max(76, Math.min(rect.width - 76, pointLeft))}px`;
      tooltip.style.top = `${Math.max(58, pointTop - 8)}px`;
      tooltip.classList.add('visible');
    }
    function selectChartRange(range) {
      if (!['hourly', 'daily'].includes(range)) return;
      chartState.range = range;
      document.querySelectorAll('[data-chart-range]').forEach((button) => {
        const active = button.dataset.chartRange === range;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
      });
      $('chartMeta').textContent = range === 'hourly' ? '最近 24 小时 · 按小时统计' : '最近 30 天 · 按日统计';
      hideChartTooltip();
      renderChart();
    }
    async function load() {
      const username = usernameInput.value.trim();
      const password = passwordInput.value;
      if (!username || !password) {
        setStatus('请输入管理员账号和密码');
        setLoginError('请输入管理员账号和密码');
        setLoginModal(true);
        return;
      }
      setLoginError('');
      setStatus('加载中...');
      let res;
      try {
        res = await fetch('/api/analytics/stats', {
          headers: { 'X-Admin-Username': username, 'X-Admin-Password': password }
        });
      } catch (error) {
        setStatus('加载失败，请检查网络连接');
        setLoginError('暂时无法连接运营服务');
        setLoginModal(true);
        return;
      }
      if (!res.ok) {
        const message = res.status === 401 ? '管理员账号或密码错误' : `加载失败 ${res.status}`;
        setStatus(message);
        setLoginError(message);
        setLoginModal(true);
        return;
      }
      const data = await res.json();
      setLoginModal(false);
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
      const registered = data.registeredUsers || {};
      const registeredEl = $('registeredUsers');
      const registeredSubEl = $('registeredUsersSub');
      if (typeof registered.count === 'number') {
        registeredEl.textContent = fmt(registered.count);
        registeredEl.classList.remove('small');
        registeredSubEl.textContent = '邮箱注册账号';
      } else {
        registeredEl.textContent = registered.configured ? '异常' : '未配置';
        registeredEl.classList.add('small');
        registeredSubEl.textContent = registered.error || '需要服务端密钥';
      }
      chartState.series = data.series || { hourly: [], daily: [] };
      renderChart();
      renderGeoMap(data.geoWeekly);
      renderPageAnalytics(data.pageToday, data.pageTrend);
      sourceState.data = data.sourceAnalytics || { sevenDays: {}, month: {} };
      renderSourceAnalytics();
      setRows('topPages', data.topPages || [], (x) => `<tr><td>${escapeHtml(x.path)}</td><td>${fmt(x.pv)}</td><td>${fmt(x.uv)}</td></tr>`);
      setRows('topReferrers', data.topReferrers || [], (x) => `<tr><td>${escapeHtml(x.referrer)}</td><td>${fmt(x.pv)}</td></tr>`);
      setRows('latest', data.latest || [], (x) => `<tr><td>${new Date(x.ts * 1000).toLocaleString('zh-CN')}</td><td>${escapeHtml(x.event_type)}</td><td>${escapeHtml(x.path)}</td></tr>`);
      setStatus(`已更新 ${new Date(data.generatedAt * 1000).toLocaleString('zh-CN')} · ${data.timezone}`);
      if (!emailLoaded) {
        emailLoaded = true;
        loadRegisteredUsers(1);
      }
      if (!timer) timer = setInterval(load, 15000);
    }
    $('loginForm').addEventListener('submit', (event) => {
      event.preventDefault();
      load();
    });
    $('openLogin').addEventListener('click', () => setLoginModal(true));
    $('closeLogin').addEventListener('click', () => setLoginModal(false));
    $('loginBackdrop').addEventListener('click', () => setLoginModal(false));
    $('refresh').addEventListener('click', load);
    $('emailPrev').addEventListener('click', () => {
      if (emailState.page > 1) loadRegisteredUsers(emailState.page - 1);
    });
    $('emailNext').addEventListener('click', () => {
      if (emailState.hasMore) loadRegisteredUsers(emailState.page + 1);
    });
    $('pageTrendSelect').addEventListener('change', (event) => {
      pageChartState.selected = event.target.value;
      $('pageChartMeta').textContent = pageChartState.selected
        ? `最近 30 天 · ${pageChartState.selected}`
        : '最近 30 天 · 请选择页面';
      hidePageChartTooltip();
      renderPageChart();
    });
    document.querySelectorAll('[data-chart-range]').forEach((button) => {
      button.addEventListener('click', () => selectChartRange(button.dataset.chartRange));
    });
    document.querySelectorAll('[data-source-range]').forEach((button) => {
      button.addEventListener('click', () => selectSourceRange(button.dataset.sourceRange));
    });
    $('trafficChart').addEventListener('pointermove', showChartTooltip);
    $('trafficChart').addEventListener('pointerleave', hideChartTooltip);
    $('trafficChart').addEventListener('pointercancel', hideChartTooltip);
    $('pageChart').addEventListener('pointermove', showPageChartTooltip);
    $('pageChart').addEventListener('pointerleave', hidePageChartTooltip);
    $('pageChart').addEventListener('pointercancel', hidePageChartTooltip);
    if ('ResizeObserver' in window) {
      const chartResizeObserver = new ResizeObserver(() => {
        window.cancelAnimationFrame(chartResizeFrame);
        chartResizeFrame = window.requestAnimationFrame(() => {
          renderChart();
          renderPageChart();
        });
      });
      chartResizeObserver.observe($('trafficChartWrap'));
      chartResizeObserver.observe($('pageChartWrap'));
    } else {
      window.addEventListener('resize', () => {
        renderChart();
        renderPageChart();
      });
    }
    setLoginModal(true);
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
        self.send_header(
            "Access-Control-Allow-Headers",
            "Content-Type, X-Admin-Username, X-Admin-Password, Authorization, apikey",
        )
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/health":
            json_response(self, {"ok": True, "service": "guji-analytics"})
            return
        if parsed.path == "/assets/world-land.json":
            static_file_response(self, WORLD_LAND_PATH, "application/geo+json; charset=utf-8")
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
        if parsed.path == "/api/analytics/registered-users":
            if not is_authorized(self):
                json_response(self, {"ok": False, "error": "unauthorized"}, HTTPStatus.UNAUTHORIZED)
                return
            fetch_registered_users_for_admin(self, parsed)
            return
        if parsed.path == "/api/hot-sectors":
            if not authorize_market_request(self):
                return
            fetch_hot_sectors(self, parsed)
            return
        if parsed.path == "/api/global-quotes":
            if not authorize_market_request(self):
                return
            fetch_global_quotes(self)
            return
        json_response(self, {"ok": False, "error": "not found"}, HTTPStatus.NOT_FOUND)

    def do_HEAD(self):
        parsed = urlparse(self.path)
        if parsed.path in {
            "/", "/ops", "/ops/", "/health", "/assets/world-land.json",
            "/api/analytics/stats", "/api/analytics/registered-users",
        }:
            head_response(self)
            return
        head_response(self, HTTPStatus.NOT_FOUND, "application/json; charset=utf-8")

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/analytics/track":
            record_event(self)
            return
        if parsed.path == "/api/fund-valuation-ranking":
            if not authorize_market_request(self):
                return
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
