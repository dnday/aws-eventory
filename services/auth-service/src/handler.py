"""auth-service: daftar dan masuk akun Eventory.

Menggantikan Cognito karena sandbox AWS Academy tidak menyediakan Cognito. Data user disimpan di
S3 (users/{email}.json), password di-hash PBKDF2, dan token ditandatangani HMAC-SHA256.
Masuk dengan Google (SSO): ID token Google diverifikasi lewat endpoint tokeninfo Google.
"""
import base64, hashlib, hmac, json, os, re, secrets, time, uuid
import urllib.error, urllib.parse, urllib.request
from datetime import datetime, timezone
import boto3
from botocore.exceptions import ClientError

s3 = boto3.client("s3")
BUCKET = os.environ["DATA_BUCKET"]
SECRET = os.environ["TOKEN_SECRET"].encode()
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")
TTL = 3600         # detik, token berlaku 1 jam
ITERATIONS = 100_000
EMAIL = re.compile(r"[^@\s/]+@[^@\s/]+\.[^@\s/]+")
DUMMY_SALT = b"\0" * 16

def resp(code, body):
    return {"statusCode": code, "headers": {"Content-Type": "application/json"}, "body": json.dumps(body)}

def hash_pw(password, salt):
    return hashlib.pbkdf2_hmac("sha256", password.encode(), salt, ITERATIONS).hex()

def sign(claims):
    payload = base64.urlsafe_b64encode(json.dumps(claims).encode()).decode()
    return payload + "." + hmac.new(SECRET, payload.encode(), hashlib.sha256).hexdigest()

def load_user(email):
    try:
        return json.loads(s3.get_object(Bucket=BUCKET, Key=f"users/{email}.json")["Body"].read())
    except s3.exceptions.NoSuchKey:
        return None

def issue(user):
    claims = {"sub": user["sub"], "email": user["email"], "org": user.get("isOrganizer") is True,
              "exp": int(time.time()) + TTL}
    return resp(200, {"token": sign(claims), "sub": claims["sub"], "email": claims["email"],
                      "isOrganizer": claims["org"], "exp": claims["exp"]})

def tokeninfo(credential):
    """Minta Google memeriksa tanda tangan ID token. None jika token tidak valid."""
    url = "https://oauth2.googleapis.com/tokeninfo?" + urllib.parse.urlencode({"id_token": credential})
    try:
        with urllib.request.urlopen(url, timeout=5) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError:
        return None

def google_login(credential):
    if not GOOGLE_CLIENT_ID:
        return resp(501, {"message": "Masuk dengan Google belum diaktifkan."})
    info = tokeninfo(credential) if credential else None
    if (not info or info.get("aud") != GOOGLE_CLIENT_ID
            or info.get("iss") not in ("accounts.google.com", "https://accounts.google.com")
            or str(info.get("email_verified")).lower() != "true"
            or int(info.get("exp", 0)) < time.time()):
        return resp(401, {"message": "Login Google tidak valid. Coba lagi."})
    email = info["email"].strip().lower()
    user = load_user(email)
    if not user:  # akun baru lewat Google selalu peserta; peran penyelenggara tetap lewat add_organizer.sh
        user = {"sub": str(uuid.uuid4()), "email": email, "provider": "google",
                "isOrganizer": False, "createdAt": datetime.now(timezone.utc).isoformat()}
        try:
            s3.put_object(Bucket=BUCKET, Key=f"users/{email}.json", Body=json.dumps(user),
                          ContentType="application/json", IfNoneMatch="*")
        except ClientError as e:
            if e.response["Error"]["Code"] not in ("PreconditionFailed", "ConditionalRequestConflict"):
                raise
            user = load_user(email)  # dibuat bersamaan oleh request lain
    return issue(user)

def lambda_handler(event, context):
    http = event["requestContext"]["http"]
    if http["method"] != "POST":
        return resp(405, {"message": "method tidak didukung"})
    raw = event.get("body") or "{}"
    body = json.loads(base64.b64decode(raw) if event.get("isBase64Encoded") else raw)
    email = str(body.get("email", "")).strip().lower()
    password = str(body.get("password", ""))

    if http["path"] == "/auth/google":
        return google_login(str(body.get("credential", "")))

    if http["path"] == "/auth/register":
        if not EMAIL.fullmatch(email):
            return resp(400, {"message": "Email tidak valid."})
        if len(password) < 8 or not re.search("[a-z]", password) or not re.search("[0-9]", password):
            return resp(400, {"message": "Password minimal 8 karakter dan harus ada huruf kecil serta angka."})
        salt = secrets.token_bytes(16)
        user = {"sub": str(uuid.uuid4()), "email": email, "salt": salt.hex(), "hash": hash_pw(password, salt),
                "isOrganizer": False, "createdAt": datetime.now(timezone.utc).isoformat()}
        try:  # IfNoneMatch: gagal jika email sudah ada, aman walau dua pendaftaran datang bersamaan
            s3.put_object(Bucket=BUCKET, Key=f"users/{email}.json", Body=json.dumps(user),
                          ContentType="application/json", IfNoneMatch="*")
        except ClientError as e:
            if e.response["Error"]["Code"] in ("PreconditionFailed", "ConditionalRequestConflict"):
                return resp(409, {"message": "Email ini sudah terdaftar. Silakan masuk."})
            raise
        return resp(201, {"sub": user["sub"], "email": email})

    # ponytail: belum ada pembatasan percobaan login (brute force); tambahkan penghitung gagal per email jika dipakai serius
    if http["path"] == "/auth/login":
        user = load_user(email) if EMAIL.fullmatch(email) else None
        # tetap menghitung hash walau user tidak ada supaya waktu respons tidak membocorkan email terdaftar
        # akun Google tidak punya password, jadi login password selalu gagal untuknya
        has_pw = bool(user and user.get("hash"))
        got = hash_pw(password, bytes.fromhex(user["salt"]) if has_pw else DUMMY_SALT)
        if not has_pw or not hmac.compare_digest(got, user["hash"]):
            return resp(401, {"message": "Email atau password salah."})
        return issue(user)

    return resp(404, {"message": "endpoint tidak ditemukan"})
