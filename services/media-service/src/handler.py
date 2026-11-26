"""media-service: membuat presigned URL supaya browser bisa upload poster acara langsung ke S3."""
import base64, hashlib, hmac, json, os, time, uuid
import boto3
from botocore.config import Config

s3 = boto3.client("s3", config=Config(signature_version="s3v4"))
BUCKET = os.environ["PHOTO_BUCKET"]
BASE_URL = os.environ["PHOTO_BASE_URL"].rstrip("/")
TYPES = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}
EXPIRES = 300  # detik
SECRET = os.environ["TOKEN_SECRET"].encode()

def resp(code, body):
    return {"statusCode": code, "headers": {"Content-Type": "application/json"}, "body": json.dumps(body)}

def caller(event):
    """sub dari token auth-service di header Authorization; None jika tidak valid (sama dengan event-service)."""
    token = (event.get("headers") or {}).get("authorization", "").removeprefix("Bearer ")
    payload, _, sig = token.partition(".")
    good = hmac.new(SECRET, payload.encode(), hashlib.sha256).hexdigest()
    if not payload or not hmac.compare_digest(sig, good):
        return None
    claims = json.loads(base64.urlsafe_b64decode(payload))
    return claims["sub"] if claims["exp"] >= time.time() else None

def lambda_handler(event, context):
    uid = caller(event)
    if not uid:
        return resp(401, {"message": "login diperlukan"})
    body = json.loads(event.get("body") or "{}")
    content_type = body.get("contentType")
    if content_type not in TYPES:
        return resp(400, {"message": "contentType harus image/jpeg, image/png, atau image/webp"})

    key = f"photos/{uid}/{uuid.uuid4()}.{TYPES[content_type]}"
    upload_url = s3.generate_presigned_url(
        "put_object",
        Params={"Bucket": BUCKET, "Key": key, "ContentType": content_type},
        ExpiresIn=EXPIRES)
    return resp(200, {"uploadUrl": upload_url, "photoUrl": f"{BASE_URL}/{key}",
                      "key": key, "expiresIn": EXPIRES})
