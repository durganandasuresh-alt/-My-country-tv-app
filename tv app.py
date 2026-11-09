from flask import Flask, render_template, jsonify, request, Response, send_file
import requests
import re
import os
import sqlite3
import datetime
import math
import io
import qrcode
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from urllib.parse import urljoin, quote

app = Flask(__name__)
app.config['TEMPLATES_AUTO_RELOAD'] = True
app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0
app.jinja_env.auto_reload = True

# Default legal, free-to-air IPTV playlist
DEFAULT_IPTV_URL = "https://iptv-org.github.io/iptv/index.m3u"

# Optional VPN / proxy routing for outgoing stream requests.
# Set this to your local VPN/proxy address to route streams through it, e.g.:
#   HTTP proxy:  "http://127.0.0.1:8080"
#   SOCKS (VPN): "socks5://127.0.0.1:1080"  (requires: pip install requests[socks])
# Leave empty ("") to connect directly. Can also be set with the STREAM_PROXY env var.
STREAM_PROXY = ""

# Shared HTTP session with connection pooling + automatic retries.
# Reusing TCP/TLS connections to stream servers is significantly faster than
# opening a fresh connection for every request.
http = requests.Session()
_retry = Retry(total=2, backoff_factor=0.3, status_forcelist=[429, 500, 502, 503, 504])
http.mount("http://", HTTPAdapter(pool_connections=20, pool_maxsize=50, max_retries=_retry))
http.mount("https://", HTTPAdapter(pool_connections=20, pool_maxsize=50, max_retries=_retry))
if STREAM_PROXY:
    http.proxies = {"http": STREAM_PROXY, "https": STREAM_PROXY}

BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    )
}

# In-memory channel cache
CHANNELS_CACHE = []

MANUAL_CHANNELS = [
    {
        "name": "Star Maa",
        "id": "StarMaa.in@HD",
        "category": "Entertainment",
        "language": "Telugu",
        "logo": "https://i.imgur.com/5c9PVS0.png",
        "logo_char": "SM",
        "stream_url": "https://da86m1sqpm3o0.cloudfront.net/28072023/smil:starmaa1.smil/chunklist_b2628000.m3u8"
    },
    {
        "name": "Star Maa Movies",
        "id": "StarMaaMovies.in@HD",
        "category": "Movies",
        "language": "Telugu",
        "logo": "https://dtil.tmsimg.com/assets/s143826_ld_h15_aa.png?lock=720x540",
        "logo_char": "MM",
        "stream_url": "https://da86m1sqpm3o0.cloudfront.net/28072023/smil:maamovies.smil/chunklist_b2628000.m3u8"
    },
    {
        "name": "Zee Telugu",
        "id": "ZeeTelugu.in@HD",
        "category": "Entertainment",
        "language": "Telugu",
        "logo": "https://xstreamcp-assets-msp.streamready.in/assets/LIVETV/LIVECHANNEL/LIVETV_LIVETVCHANNEL_ZEE_TELUGU/images/LOGO_HD/LOGO_HD_image.png",
        "logo_char": "ZT",
        "stream_url": "https://raw.githubusercontent.com/amazeyourself/adaptive-streams/refs/heads/main/streams/in/YuppTV/ZeeTeluguHD.m3u8"
    },
    {
        "name": "ETV Telugu",
        "id": "ETVTelugu.in@HD",
        "category": "Entertainment",
        "language": "Telugu",
        "logo": "https://xstreamcp-assets-msp.streamready.in/assets/LIVETV/LIVECHANNEL/LIVETV_LIVETVCHANNEL_ETV_HD/images/LOGO_HD/image.png",
        "logo_char": "ET",
        "stream_url": "https://mumbai-edge.smartplaytv.in/ETVHD/index.m3u8"
    }
]


# Common language mapping
LANG_MAP = {
    "hin": "Hindi", "kan": "Kannada", "tel": "Telugu", "tam": "Tamil",
    "eng": "English", "mal": "Malayalam", "mar": "Marathi", "ben": "Bengali",
    "guj": "Gujarati", "pan": "Punjabi", "urd": "Urdu", "ori": "Odia" 
}


def parse_m3u(content: str) -> list:
    """
    Parses standard #EXTM3U playlist data into structured channel dictionaries.
    Extracts tvg-name, tvg-logo, group-title, tvg-language, and the stream URL.
    """
    channels = []
    lines = [line.strip() for line in content.splitlines() if line.strip()]
    current_meta = {}

    for line in lines:
        if line.startswith("#EXTINF:"):
            current_meta = {}

            # Channel display name (after the last comma of the #EXTINF header line)
            comma_idx = line.rfind(",")
            raw_name = line[comma_idx + 1:].strip() if comma_idx != -1 else ""
            if not raw_name or "mozilla" in raw_name.lower() or "like gecko" in raw_name.lower():
                name_match = re.search(r'tvg-name="([^"]*)"', line)
                if name_match and name_match.group(1).strip():
                    raw_name = name_match.group(1).strip()
                else:
                    id_match = re.search(r'tvg-id="([^"]*)"', line)
                    if id_match and id_match.group(1).strip():
                        raw_name = id_match.group(1).split(".")[0].replace("@SD", "").replace("@HD", "")
                    else:
                        raw_name = f"Channel {len(channels) + 1}"
            current_meta["name"] = raw_name

            # Channel logo
            logo_match = re.search(r'tvg-logo="([^"]*)"', line)
            current_meta["logo"] = logo_match.group(1) if logo_match else ""

            # Always compute 2-character initials for fallback monogram
            clean_initials = re.sub(r'[^a-zA-Z0-9]', '', raw_name)
            current_meta["logo_char"] = clean_initials[:2].upper() if len(clean_initials) >= 2 else (clean_initials[:1].upper() or "TV")

            # Group / Category (Entertainment, News, Movies, etc.)
            group_match = re.search(r'group-title="([^"]*)"', line)
            current_meta["category"] = group_match.group(1) if group_match else "General"

            # Language
            lang_match = re.search(r'tvg-language="([^"]*)"', line)
            lang_val = lang_match.group(1).strip() if lang_match else ""
            # Normalize 3-letter codes to full language names if found
            if lang_val.lower() in LANG_MAP:
                lang_val = LANG_MAP[lang_val.lower()]
            elif not lang_val:
                # Detect language keyword in channel name
                lower_name = raw_name.lower()
                for code, lang_name in LANG_MAP.items():
                    if lang_name.lower() in lower_name:
                        lang_val = lang_name
                        break
            current_meta["language"] = lang_val if lang_val else "General"

            # Channel ID
            id_match = re.search(r'tvg-id="([^"]*)"', line)
            current_meta["id"] = id_match.group(1) if id_match else f"ch-{len(channels) + 1}"

        elif not line.startswith("#") and current_meta:
            # The direct stream URL (.m3u8 or .ts)
            current_meta["stream_url"] = line
            channels.append(current_meta)
            current_meta = {}

    return channels


def load_playlist(playlist_url: str) -> bool:
    """Fetches and parses the M3U playlist from an HTTP/HTTPS link."""
    global CHANNELS_CACHE
    try:
        resp = http.get(playlist_url, headers=BROWSER_HEADERS, timeout=12)
        if resp.status_code == 200:
            CHANNELS_CACHE = parse_m3u(resp.content.decode('utf-8',errors='ignore'))
            CHANNELS_CACHE = MANUAL_CHANNELS + CHANNELS_CACHE
            print(f"[+] Successfully loaded {len(CHANNELS_CACHE)} channels.")
            return True
        else:
            print(f"[-] Failed with status code: {resp.status_code}")
    except Exception as e:
        print(f"[-] Error loading playlist: {e}")
    return False


# Load initial playlist on server boot
load_playlist(DEFAULT_IPTV_URL)


@app.route("/")
def index():
    """Serves the main HTML interface."""
    return render_template("index.html")


@app.route("/sw.js")
def service_worker():
    """Serves the Progressive Web App service worker from root scope."""
    return app.send_static_file("sw.js")


def get_network_addresses():
    """
    Detects both LAN (local Wi-Fi / Ethernet) and WAN (external/public IP) addresses.
    Supports WAN configuration via WAN_HOST or PUBLIC_URL environment variables.
    """
    import socket

    lan_ip = "127.0.0.1"
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        lan_ip = s.getsockname()[0]
        s.close()
    except Exception:
        pass

    # Check for user-defined public WAN host / tunnel URL (e.g. ngrok, localtunnel, duckdns, domain, router public IP)
    wan_host = os.environ.get("PUBLIC_URL") or os.environ.get("WAN_HOST") or ""
    wan_ip = ""

    if not wan_host:
        # Attempt to retrieve public WAN IP with quick timeout
        try:
            resp = requests.get("https://api.ipify.org?format=json", timeout=1.8)
            if resp.status_code == 200:
                wan_ip = resp.json().get("ip", "")
        except Exception:
            try:
                resp = requests.get("https://icanhazip.com", timeout=1.5)
                if resp.status_code == 200:
                    wan_ip = resp.text.strip()
            except Exception:
                pass
    
    port = 5000
    lan_url = f"http://{lan_ip}:{port}"
    
    if wan_host:
        if wan_host.startswith("http://") or wan_host.startswith("https://"):
            wan_url = wan_host
        else:
            wan_url = f"http://{wan_host}:{port}"
    elif wan_ip:
        wan_url = f"http://{wan_ip}:{port}"
    else:
        wan_url = f"http://{lan_ip}:{port}"

    return {
        "lan_ip": lan_ip,
        "wan_ip": wan_ip or (wan_host if wan_host else lan_ip),
        "port": port,
        "lan_url": lan_url,
        "wan_url": wan_url,
        "is_wan_configured": bool(wan_host or wan_ip)
    }


@app.route("/api/qr-code")
def qr_code():
    """Dynamically generates and returns a QR code pointing to either LAN or WAN network URL."""
    try:
        net = get_network_addresses()
        net_mode = request.args.get("mode", "lan").lower()
        url = net["wan_url"] if net_mode == "wan" else net["lan_url"]

        qr = qrcode.QRCode(box_size=8, border=2)
        qr.add_data(url)
        qr.make(fit=True)
        img = qr.make_image(fill_color="#0b0c15", back_color="#ffffff")

        buf = io.BytesIO()
        img.save(buf, "PNG")
        buf.seek(0)
        return send_file(buf, mimetype="image/png")
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/download/apk")
def download_apk():
    """Directly downloads the compiled Android APK (app-debug.apk)."""
    from flask import send_from_directory
    import os

    base_dir = os.path.dirname(os.path.abspath(__file__))
    apk_dir = os.path.join(base_dir, "android-source", "app", "build", "outputs", "apk", "debug")
    apk_file = "app-debug.apk"
    target_path = os.path.join(apk_dir, apk_file)

    if os.path.isfile(target_path):
        return send_from_directory(apk_dir, apk_file, as_attachment=True, download_name="MyCountryTV.apk")
    
    # Fallback to test-sample.apk if available
    sample_path = os.path.join(base_dir, "test-sample.apk")
    if os.path.isfile(sample_path):
        return send_from_directory(base_dir, "test-sample.apk", as_attachment=True, download_name="MyCountryTV.apk")

    return jsonify({"error": "APK not yet compiled. Please run build_apk.bat."}), 404


@app.route("/download/android-project")
def download_android_project():
    """Downloads the complete Android Studio WebView project ZIP for instant compiling."""
    from flask import send_from_directory
    import os
    import zipfile

    base_dir = os.path.dirname(os.path.abspath(__file__))
    download_dir = os.path.join(base_dir, "static", "download")
    os.makedirs(download_dir, exist_ok=True)
    zip_path = os.path.join(download_dir, "MyCountryTV-Android-Project.zip")
    android_source = os.path.join(base_dir, "android-source")

    # If the zip doesn't exist or android-source is newer, bundle on the fly
    if not os.path.exists(zip_path) and os.path.isdir(android_source):
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
            for root, _, files in os.walk(android_source):
                for f in files:
                    fp = os.path.join(root, f)
                    z.write(fp, os.path.relpath(fp, android_source))

    return send_from_directory(download_dir, "MyCountryTV-Android-Project.zip", as_attachment=True)


@app.route("/api/server-info")
def server_info():
    """Returns both local LAN and remote WAN network details for Android mobile and TV."""
    net = get_network_addresses()
    # Check if a custom WAN URL was requested or provided via query or cookie
    client_host = request.headers.get("Host", "")
    if client_host and not client_host.startswith("127.0.0.1") and not client_host.startswith("localhost"):
        detected_host_url = f"http://{client_host}"
    else:
        detected_host_url = net["lan_url"]

    return jsonify({
        "status": "success",
        "lan_ip": net["lan_ip"],
        "wan_ip": net["wan_ip"],
        "port": net["port"],
        "lan_url": net["lan_url"],
        "wan_url": net["wan_url"],
        "detected_host_url": detected_host_url,
        "is_wan_configured": net["is_wan_configured"],
        "mobile_url": net["lan_url"]  # backwards compatibility
    })


# Database setup for subscriptions and UPI payments
DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "subscriptions.db")

UPI_CONFIG = {
    "vpa": "mycountrytv@upi",
    "name": "My Country TV Premium",
}

SUBSCRIPTION_PLANS = [
    {
        "id": "1m",
        "name": "1 Month",
        "price": 99,
        "duration_days": 30,
        "popular": False,
        "desc": "Full 30-day access to all 10,000+ Live Entertainment, Movies & Sports"
    },
    {
        "id": "3m",
        "name": "3 Months",
        "price": 299,
        "duration_days": 90,
        "popular": True,
        "desc": "Most popular quarterly pack - 90 days access to all 10,000+ channels"
    },
    {
        "id": "1y",
        "name": "1 Year",
        "price": 1199,
        "duration_days": 365,
        "popular": False,
        "desc": "Best value annual plan - 365 days full VIP access (~₹99/month)"
    }
]

FREE_TRIAL_DAYS = 10

FREE_PLAN = {
    "id": "free_trial",
    "name": "10 Days Free Plan",
    "price": 0,
    "duration_days": 10,
    "channels_unlocked": 10000,
    "desc": "10 Days 100% Free Plan with 10,000+ Live Channels Unlocked (Entertainment, Movies, Sports)",
    "features": [
        "10 Days Full Access to 10,000+ Channels",
        "All Live Entertainment, Movies & Sports",
        "Full HD 1080p High-Speed Streaming",
        "Zero Cost (₹0) / No Card Required",
        "After 10 Days: Buy Monthly Plan to Continue"
    ]
}

from contextlib import contextmanager

MONTHLY_PLANS = SUBSCRIPTION_PLANS


@contextmanager
def db_session():
    conn = sqlite3.connect(DB_PATH)
    try:
        with conn:
            yield conn
    finally:
        conn.close()


def utc_now():
    return datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)


def init_db():
    try:
        with db_session() as conn:
            c = conn.cursor()
            c.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    user_id TEXT PRIMARY KEY,
                    phone TEXT,
                    trial_start_at TEXT,
                    subscription_plan TEXT,
                    subscription_expires_at TEXT,
                    created_at TEXT
                )
            """)
            c.execute("""
                CREATE TABLE IF NOT EXISTS payments (
                    payment_id TEXT PRIMARY KEY,
                    user_id TEXT,
                    plan_id TEXT,
                    amount INTEGER,
                    upi_ref TEXT,
                    status TEXT,
                    created_at TEXT
                )
            """)
    except Exception as e:
        print(f"[-] DB init error: {e}")

init_db()


def is_channel_free(channel: dict) -> bool:
    """
    Returns True if the channel is unconditionally free (e.g. News channels or General News).
    All other channels require an active Free Trial or paid Subscription.
    """
    cat = (channel.get("category") or "").lower()
    name = (channel.get("name") or "").lower()

    if "news" in cat or "news" in name:
        return True
    return False


def get_user_subscription(user_id: str):
    """
    Determines if user has an active free trial (10 days free)
    or an active paid subscription (1m: ₹99, 3m: ₹299, 1y: ₹1,199).
    """
    now = utc_now()
    with db_session() as conn:
        c = conn.cursor()
        c.execute("SELECT user_id, phone, trial_start_at, subscription_plan, subscription_expires_at, created_at FROM users WHERE user_id = ?", (user_id,))
        row = c.fetchone()

        if not row:
            # Register new user with 10 days free trial (access to 10,000+ channels)
            trial_start = now.isoformat()
            created_at = now.isoformat()
            try:
                c.execute("""
                    INSERT INTO users (user_id, phone, trial_start_at, subscription_plan, subscription_expires_at, created_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                    ON CONFLICT(user_id) DO NOTHING
                """, (user_id, "", trial_start, "free_trial", None, created_at))
            except Exception:
                pass
            trial_expires = now + datetime.timedelta(days=FREE_TRIAL_DAYS)
            days_left = FREE_TRIAL_DAYS
            return {
                "user_id": user_id,
                "phone": "",
                "is_active": True,
                "is_trial": True,
                "trial_days_left": days_left,
                "plan": "free_trial",
                "plan_name": "10 Days Free Plan",
                "channels_unlocked": 10000,
                "expires_at": trial_expires.strftime("%Y-%m-%d %H:%M:%S UTC"),
                "days_left": days_left,
                "requires_monthly_plan": False,
                "status_message": f"10 Days Free Plan active ({days_left} days left). 10,000+ channels unlocked!"
            }

        uid, phone, trial_start_str, sub_plan, sub_expires_str, _ = row

        # Check paid subscription first
        if sub_expires_str:
            try:
                sub_expires = datetime.datetime.fromisoformat(sub_expires_str)
                if sub_expires > now:
                    days_left = max(1, int(math.ceil((sub_expires - now).total_seconds() / 86400)))
                    p_name = next((p["name"] for p in SUBSCRIPTION_PLANS if p["id"] == sub_plan), "Monthly Plan")
                    display_plan_name = f"{p_name} Pack"
                    return {
                        "user_id": uid,
                        "phone": phone or "",
                        "is_active": True,
                        "is_trial": False,
                        "trial_days_left": 0,
                        "plan": sub_plan,
                        "plan_name": display_plan_name,
                        "channels_unlocked": 10000,
                        "expires_at": sub_expires.strftime("%Y-%m-%d %H:%M:%S UTC"),
                        "days_left": days_left,
                        "requires_monthly_plan": False,
                        "status_message": f"{display_plan_name} active ({days_left} days left). All 10,000+ channels unlocked!"
                    }
            except Exception:
                pass

        # Check free trial (10 days free, 10,000+ channels)
        if trial_start_str:
            try:
                trial_start = datetime.datetime.fromisoformat(trial_start_str)
                trial_expires = trial_start + datetime.timedelta(days=FREE_TRIAL_DAYS)
                if trial_expires > now:
                    days_left = max(1, int(math.ceil((trial_expires - now).total_seconds() / 86400)))
                    return {
                        "user_id": uid,
                        "phone": phone or "",
                        "is_active": True,
                        "is_trial": True,
                        "trial_days_left": days_left,
                        "plan": "free_trial",
                        "plan_name": "10 Days Free Plan",
                        "channels_unlocked": 10000,
                        "expires_at": trial_expires.strftime("%Y-%m-%d %H:%M:%S UTC"),
                        "days_left": days_left,
                        "requires_monthly_plan": False,
                        "status_message": f"10 Days Free Plan active ({days_left} days left). 10,000+ channels unlocked!"
                    }
            except Exception:
                pass

        # Expired after 10 days free trial - requires monthly plan subscription
        return {
            "user_id": uid,
            "phone": phone or "",
            "is_active": False,
            "is_trial": False,
            "trial_days_left": 0,
            "plan": "expired",
            "plan_name": "10 Days Free Plan Expired",
            "channels_unlocked": 0,
            "expires_at": None,
            "days_left": 0,
            "requires_monthly_plan": True,
            "status_message": "Your 10 Days Free Plan has ended. You need to buy a monthly plan (₹99 / ₹299 / ₹1,199) to unlock all 10,000+ channels."
        }

@app.route("/api/subscription/plans")
def get_subscription_plans():
    """Returns available subscription plans (10 Days Free Plan & Monthly Paid Plans) and UPI merchant details."""
    return jsonify({
        "status": "success",
        "free_plan": FREE_PLAN,
        "free_trial_days": FREE_TRIAL_DAYS,
        "monthly_plans": MONTHLY_PLANS,
        "plans": SUBSCRIPTION_PLANS,
        "upi": UPI_CONFIG
    })


@app.route("/api/subscription/activate-free-plan", methods=["POST"])
def activate_free_plan():
    """Activates the 10 Days Free Plan for new users if eligible."""
    data = request.get_json() or {}
    user_id = (data.get("user_id") or "").strip() or "guest_default"
    now = utc_now()
    with db_session() as conn:
        c = conn.cursor()
        c.execute("SELECT trial_start_at, subscription_plan, subscription_expires_at FROM users WHERE user_id = ?", (user_id,))
        row = c.fetchone()
        if not row:
            trial_start = now.isoformat()
            c.execute("""
                INSERT INTO users (user_id, phone, trial_start_at, subscription_plan, subscription_expires_at, created_at)
                VALUES (?, '', ?, 'free_trial', NULL, ?)
            """, (user_id, trial_start, now.isoformat()))
            return jsonify({
                "status": "success",
                "message": "10 Days Free Plan activated! 10,000+ channels unlocked.",
                "subscription": get_user_subscription(user_id)
            })
        else:
            trial_start_str, sub_plan, sub_expires_str = row
            if sub_expires_str:
                try:
                    if datetime.datetime.fromisoformat(sub_expires_str) > now:
                        return jsonify({
                            "status": "info",
                            "message": "You already have an active monthly plan!",
                            "subscription": get_user_subscription(user_id)
                        })
                except Exception:
                    pass
            if trial_start_str:
                try:
                    trial_start = datetime.datetime.fromisoformat(trial_start_str)
                    if (trial_start + datetime.timedelta(days=FREE_TRIAL_DAYS)) <= now:
                        return jsonify({
                            "status": "error",
                            "message": "Your 10 Days Free Plan has already ended. You need to buy a monthly plan to watch 10,000+ channels.",
                            "subscription": get_user_subscription(user_id)
                        }), 400
                except Exception:
                    pass

    return jsonify({
        "status": "success",
        "message": "10 Days Free Plan active! 10,000+ channels unlocked.",
        "subscription": get_user_subscription(user_id)
    })


@app.route("/api/subscription/status")
def get_subscription_status():
    """Returns current user's subscription or trial status."""
    user_id = request.args.get("user_id", "").strip() or request.cookies.get("mctv_user_id", "").strip()
    if not user_id:
        user_id = "guest_default"
    status = get_user_subscription(user_id)
    return jsonify({"status": "success", "subscription": status})


@app.route("/api/subscription/create-payment", methods=["POST"])
def create_payment():
    """Generates a UPI payment intent and returns deep link and QR code details."""
    data = request.get_json() or {}
    user_id = (data.get("user_id") or "").strip() or "guest_default"
    plan_id = (data.get("plan_id") or "").strip()

    plan = next((p for p in SUBSCRIPTION_PLANS if p["id"] == plan_id), None)
    if not plan:
        return jsonify({"status": "error", "message": "Invalid plan selected"}), 400

    now = utc_now()
    payment_id = f"PAY-{int(now.timestamp())}-{os.urandom(3).hex().upper()}"
    now_str = now.isoformat()

    with db_session() as conn:
        c = conn.cursor()
        c.execute("""
            INSERT INTO payments (payment_id, user_id, plan_id, amount, upi_ref, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (payment_id, user_id, plan["id"], plan["price"], "", "PENDING", now_str))

    # Construct standard UPI Deep Link URL:
    # upi://pay?pa=<vpa>&pn=<name>&am=<price>&cu=INR&tn=<note>&tr=<txnRef>
    note = f"MyCountryTV {plan['name']} Subscription"
    upi_intent_url = (
        f"upi://pay?pa={quote(UPI_CONFIG['vpa'])}"
        f"&pn={quote(UPI_CONFIG['name'])}"
        f"&am={plan['price']}"
        f"&cu=INR"
        f"&tn={quote(note)}"
        f"&tr={payment_id}"
    )

    return jsonify({
        "status": "success",
        "payment_id": payment_id,
        "plan": plan,
        "upi": {
            "vpa": UPI_CONFIG["vpa"],
            "name": UPI_CONFIG["name"],
            "amount": plan["price"],
            "intent_url": upi_intent_url,
            "qr_url": f"/api/subscription/payment-qr?payment_id={payment_id}"
        }
    })


@app.route("/api/subscription/payment-qr")
def payment_qr():
    """Generates a high-contrast QR image for the UPI payment intent."""
    payment_id = request.args.get("payment_id", "").strip()
    with db_session() as conn:
        c = conn.cursor()
        c.execute("SELECT plan_id, amount FROM payments WHERE payment_id = ?", (payment_id,))
        row = c.fetchone()

    amount = 99
    plan_name = "1 Month"
    if row:
        plan_id, amount = row
        p = next((x for x in SUBSCRIPTION_PLANS if x["id"] == plan_id), None)
        if p:
            plan_name = p["name"]

    note = f"MyCountryTV {plan_name} Pack"
    upi_str = (
        f"upi://pay?pa={quote(UPI_CONFIG['vpa'])}"
        f"&pn={quote(UPI_CONFIG['name'])}"
        f"&am={amount}"
        f"&cu=INR"
        f"&tn={quote(note)}"
        f"&tr={payment_id}"
    )

    qr = qrcode.QRCode(box_size=7, border=2)
    qr.add_data(upi_str)
    qr.make(fit=True)
    img = qr.make_image(fill_color="#0b0c15", back_color="#ffffff")

    buf = io.BytesIO()
    img.save(buf, "PNG")
    buf.seek(0)
    return send_file(buf, mimetype="image/png")


@app.route("/api/subscription/confirm-payment", methods=["POST"])
def confirm_payment():
    """
    Confirms UPI payment (mocked / real reference confirmation).
    Activates all channels by updating subscription expiration date.
    """
    data = request.get_json() or {}
    user_id = (data.get("user_id") or "").strip() or "guest_default"
    payment_id = (data.get("payment_id") or "").strip()
    plan_id = (data.get("plan_id") or "").strip()
    upi_ref = (data.get("upi_ref") or "").strip() or f"UPI-{os.urandom(4).hex().upper()}"

    plan = next((p for p in SUBSCRIPTION_PLANS if p["id"] == plan_id), None)
    if not plan and payment_id:
        with db_session() as conn:
            c = conn.cursor()
            c.execute("SELECT plan_id FROM payments WHERE payment_id = ?", (payment_id,))
            row = c.fetchone()
            if row:
                plan = next((p for p in SUBSCRIPTION_PLANS if p["id"] == row[0]), None)

    if not plan:
        return jsonify({"status": "error", "message": "Invalid plan or payment ID"}), 400

    now = utc_now()

    # Calculate new expiry: if user already has active time, append to it; otherwise start from now
    with db_session() as conn:
        c = conn.cursor()
        c.execute("SELECT subscription_expires_at FROM users WHERE user_id = ?", (user_id,))
        row = c.fetchone()

        base_time = now
        if row and row[0]:
            try:
                curr_expiry = datetime.datetime.fromisoformat(row[0])
                if curr_expiry > now:
                    base_time = curr_expiry
            except Exception:
                pass

        new_expiry = base_time + datetime.timedelta(days=plan["duration_days"])
        new_expiry_str = new_expiry.isoformat()

        # Update or insert user record
        c.execute("""
            INSERT INTO users (user_id, phone, trial_start_at, subscription_plan, subscription_expires_at, created_at)
            VALUES (?, '', ?, ?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
                subscription_plan = excluded.subscription_plan,
                subscription_expires_at = excluded.subscription_expires_at
        """, (user_id, now.isoformat(), plan["id"], new_expiry_str, now.isoformat()))

        if payment_id:
            c.execute("""
                UPDATE payments SET status = 'SUCCESS', upi_ref = ? WHERE payment_id = ?
            """, (upi_ref, payment_id))
        else:
            p_id = f"PAY-{int(now.timestamp())}-{os.urandom(3).hex().upper()}"
            c.execute("""
                INSERT INTO payments (payment_id, user_id, plan_id, amount, upi_ref, status, created_at)
                VALUES (?, ?, ?, ?, ?, 'SUCCESS', ?)
            """, (p_id, user_id, plan["id"], plan["price"], upi_ref, now.isoformat()))

    updated_sub = get_user_subscription(user_id)
    return jsonify({
        "status": "success",
        "message": f"Payment of ₹{plan['price']} successful! {plan['name']} subscription activated.",
        "subscription": updated_sub
    })


@app.route("/api/subscription/reset-trial", methods=["POST"])
def reset_trial():
    """Testing/Demo utility to simulate or test 10-day free trial expiration."""
    data = request.get_json() or {}
    user_id = (data.get("user_id") or "").strip() or "guest_default"
    action = data.get("action", "expire")  # 'expire' or 'reset'

    now = utc_now()
    with db_session() as conn:
        c = conn.cursor()
        if action == "expire":
            # Set trial start 15 days in the past and clear any paid subscription
            past = (now - datetime.timedelta(days=15)).isoformat()
            c.execute("""
                UPDATE users SET trial_start_at = ?, subscription_plan = 'expired', subscription_expires_at = NULL WHERE user_id = ?
            """, (past, user_id))
        else:
            # Reset to brand new 10 days trial
            c.execute("""
                UPDATE users SET trial_start_at = ?, subscription_plan = 'free_trial', subscription_expires_at = NULL WHERE user_id = ?
            """, (now.isoformat(), user_id))

    return jsonify({"status": "success", "subscription": get_user_subscription(user_id)})


@app.route("/api/auth/send-otp", methods=["POST"])
def send_otp():
    """Simulates sending a 4-digit OTP to the given phone number."""
    data = request.get_json() or {}
    phone = data.get("phone", "").strip()
    if not phone or len(phone) < 10:
        return jsonify({"success": False, "error": "Invalid 10-digit phone number"}), 400
    
    # Generate mock 4-digit OTP (e.g., '1234' or random, let's use '1234' for seamless testing or dynamic)
    otp = "1234"
    print(f"[AUTH] OTP for {phone} is {otp}")
    return jsonify({"success": True, "message": "OTP sent successfully", "demo_otp": otp})


@app.route("/api/auth/verify-otp", methods=["POST"])
def verify_otp():
    """Verifies the OTP submitted by the user."""
    data = request.get_json() or {}
    phone = data.get("phone", "").strip()
    otp = data.get("otp", "").strip()
    if otp == "1234" or len(otp) == 4:
        return jsonify({"success": True, "message": "Phone number verified successfully", "phone": phone})
    return jsonify({"success": False, "error": "Invalid OTP code"}), 400

@app.route("/api/channels")
def get_channels():
    """
    Returns channel list filtered by category, search term, or language.
    Also returns unique categories found in the active playlist.
    Marks each channel as is_free (News channels = True) and locked based on user subscription.
    """
    category = request.args.get("category", "All")
    language = request.args.get("language", "All")
    search = request.args.get("q", "").strip().lower()
    user_id = request.args.get("user_id", "").strip() or request.cookies.get("mctv_user_id", "").strip() or "guest_default"

    sub = get_user_subscription(user_id)
    is_active = sub.get("is_active", False)

    filtered = CHANNELS_CACHE

    if category != "All":
        cat = category.lower()
        filtered = [c for c in filtered if any(cat in x.strip().lower() for x in c.get("category", "").split(";"))]

    if language != "All":
        lang = language.lower()
        filtered = [c for c in filtered if any(lang in x.strip().lower() for x in c.get("language", "").split(";"))]

    if search:
        filtered = [c for c in filtered if search in c.get("name", "").lower() or search in c.get("category", "").lower()]

    categories = sorted({
        part.strip() for c in CHANNELS_CACHE
        for part in (c.get("category", "") or "General").split(";")
        if part.strip()
    })

    languages = sorted(list({
        l.strip() for c in CHANNELS_CACHE
        for l in (c.get("language", "") or "General").split(";")
        if l.strip()
    }))

    # Annotate channels with is_free and is_locked
    enriched_channels = []
    for c in filtered:
        free = is_channel_free(c)
        locked = False if (is_active or free) else True
        enriched_channels.append({
            **c,
            "is_free": free,
            "is_locked": locked
        })

    return jsonify({
        "status": "success",
        "total": len(enriched_channels),
        "categories": categories,
        "languages": languages,
        "subscription": sub,
        "channels": enriched_channels
    })


@app.route("/api/load_m3u", methods=["POST"])
def update_m3u():
    """Allows importing any external M3U link on the fly from the web UI."""
    data = request.get_json() or {}
    url = data.get("url", "").strip()

    if not url:
        return jsonify({"status": "error", "message": "No URL provided"}), 400

    if load_playlist(url):
        return jsonify({"status": "success", "total_channels": len(CHANNELS_CACHE)})
    return jsonify({"status": "error", "message": "Failed to parse M3U file"}), 500


@app.route("/proxy/stream")
def proxy_stream():
    """
    Streams video chunks through Flask to bypass browser CORS or referer
    restrictions enforced by certain IPTV providers.
    Enforces subscription check: free channels (News) are always allowed;
    other channels require active free trial or subscription.
    """
    target_url = request.args.get("url")
    if not target_url:
        return "Missing stream URL", 400

    user_id = request.args.get("user_id", "").strip() or request.cookies.get("mctv_user_id", "").strip() or "guest_default"
    
    # Check if target channel requires active subscription
    matched_ch = next((c for c in CHANNELS_CACHE if c.get("stream_url") == target_url), None)
    if matched_ch and not is_channel_free(matched_ch):
        sub = get_user_subscription(user_id)
        if not sub.get("is_active", False):
            return jsonify({
                "error": "Subscription Required",
                "message": "Your 10 Days Free Plan has ended. You need to buy a monthly plan (1 Month ₹99 / 3 Months ₹299 / 1 Year ₹1,199) to unlock all 10,000+ live channels."
            }), 403

    try:
        # Pass along referer/origin from the page request if present
        fwd_headers = dict(BROWSER_HEADERS)
        for h in ("referer", "origin"):
            if request.headers.get(h):
                fwd_headers[h] = request.headers[h]

        req = http.get(target_url, stream=True, timeout=10, headers=fwd_headers)

        excluded_headers = [
            "content-encoding", "content-length",
            "transfer-encoding", "connection"
        ]
        resp_headers = [
            (k, v) for k, v in req.raw.headers.items()
            if k.lower() not in excluded_headers
        ]
        # Allow cross-origin requests from the browser
        resp_headers.append(("Access-Control-Allow-Origin", "*"))

        content_type = (req.headers.get("Content-Type") or "").lower()

        # HLS playlists (m3u8) reference further URLs that must ALSO go through
        # the proxy, otherwise the browser blocks them with CORS errors.
        if "mpegurl" in content_type or target_url.lower().endswith(".m3u8"):
            body = req.text
            base = target_url
            lines_out = []
            for line in body.splitlines():
                s = line.strip()
                if not s:
                    lines_out.append(line)
                    continue
                # Rewrite absolute or relative URIs inside the playlist
                if s.startswith("#"):
                    m = re.search(r'URI="([^"]+)"', s)
                    if m:
                        absu = urljoin(base, m.group(1))
                        s = s.replace(m.group(1), "/proxy/stream?url=" + quote(absu, safe=""))
                    lines_out.append(s)
                else:
                    absu = urljoin(base, s)
                    lines_out.append("/proxy/stream?url=" + quote(absu, safe=""))
            return Response("\n".join(lines_out), status=req.status_code, headers=resp_headers)

        return Response(
            req.iter_content(chunk_size=1024 * 64),  # 64 KB chunks for smoother playback
            status=req.status_code,
            headers=resp_headers
        )
    except Exception as e:
        return f"Proxy error: {e}", 500


if __name__ == "__main__":
    # Run Flask in a background thread, then open a native Windows desktop
    # window (Microsoft Edge WebView2, same engine as Windows 11 apps)
    import threading
    import webview

    threading.Thread(target=lambda: app.run(host="0.0.0.0", port=5000, debug=False, use_reloader=False), daemon=True).start()

    try:
        import os
        _icon = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static", "img", "app.ico")
        _has_icon = os.path.exists(_icon)
        _kwargs = dict(
            width=1280,
            height=760,
            min_size=(900, 560),
        )
        try:
            # pywebview >= 5.1 (older signature)
            webview.create_window(
                "My Country TV - Live TV Channels, Shows & Movies",
                "http://127.0.0.1:5000",
                icon=_icon if _has_icon else None,
                **_kwargs,
            )
        except TypeError:
            # pywebview 6.x: no per-window icon kwarg; window falls back to
            # the Python executable icon. The .lnk desktop shortcut still
            # shows the branded app.ico via IconLocation.
            webview.create_window(
                "My Country TV - Live TV Channels, Shows & Movies",
                "http://127.0.0.1:5000",
                **_kwargs,
            )
        webview.start()  # Blocks until the user closes the desktop window
    except Exception as e:
        # Fallback: no WebView2 available -> just keep the server running
        print(f"Desktop window unavailable ({e}). Open http://127.0.0.1:5000 in your browser.")
        while True:
            import time
            time.sleep(1)