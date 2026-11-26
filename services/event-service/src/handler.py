import base64, hashlib, hmac, json, os, re, time, uuid
from datetime import datetime, timezone
import boto3
from botocore.exceptions import ClientError

s3 = boto3.client("s3")
BUCKET = os.environ["DATA_BUCKET"]
SECRET = os.environ["TOKEN_SECRET"].encode()
CATEGORY = {"SEMINAR", "WORKSHOP", "KONSER", "LOMBA", "LAINNYA"}
STATUS = {"DRAFT", "PUBLISHED", "CANCELLED"}
NEXT_STATUS = {"DRAFT": {"DRAFT", "PUBLISHED"}, "PUBLISHED": {"PUBLISHED", "CANCELLED"}, "CANCELLED": set()}
FIELDS = ("title", "category", "venue", "startAt", "price", "quota",
          "description", "posterUrl", "organizerName", "status")
EVENT_ID = re.compile(r"[0-9a-f-]{36}")

def resp(code, body=None):
    return {"statusCode": code,
            "headers": {"Content-Type": "application/json"},
            "body": "" if body is None else json.dumps(body)}

def caller(event):
    """(sub, is_organizer) dari token auth-service di header Authorization; (None, False) jika tidak valid."""
    # sama dengan media-service; disalin karena tiap Lambda di-zip dari foldernya sendiri
    token = (event.get("headers") or {}).get("authorization", "").removeprefix("Bearer ")
    payload, _, sig = token.partition(".")
    good = hmac.new(SECRET, payload.encode(), hashlib.sha256).hexdigest()
    if not payload or not hmac.compare_digest(sig, good):
        return None, False
    claims = json.loads(base64.urlsafe_b64decode(payload))
    if claims["exp"] < time.time():
        return None, False
    return claims["sub"], claims.get("org") is True

# ---------------------------------------------------------------- penyimpanan: satu objek JSON per acara di S3
def key(event_id):
    return f"events/{event_id}.json"

def load(event_id):
    """(item, etag) atau (None, None) jika tidak ada."""
    if not event_id or not EVENT_ID.fullmatch(event_id):
        return None, None
    try:
        obj = s3.get_object(Bucket=BUCKET, Key=key(event_id))
    except s3.exceptions.NoSuchKey:
        return None, None
    return json.loads(obj["Body"].read()), obj["ETag"]

def save(item, **condition):
    s3.put_object(Bucket=BUCKET, Key=key(item["eventId"]), Body=json.dumps(item),
                  ContentType="application/json", **condition)

def load_all():
    # ponytail: list + get per objek, O(n) request; cukup untuk ratusan acara, pindah ke DynamoDB jika tersedia
    pages = s3.get_paginator("list_objects_v2").paginate(Bucket=BUCKET, Prefix="events/")
    keys = [o["Key"] for p in pages for o in p.get("Contents", [])]
    return [json.loads(s3.get_object(Bucket=BUCKET, Key=k)["Body"].read()) for k in keys]

def invalid(body):
    if "category" in body and body["category"] not in CATEGORY:
        return "category tidak valid"
    if "status" in body and body["status"] not in STATUS:
        return "status harus DRAFT, PUBLISHED, atau CANCELLED"
    for k in ("title", "venue"):
        if k in body and not str(body[k]).strip():
            return f"{k} tidak boleh kosong"
    if "startAt" in body:
        try:
            datetime.fromisoformat(str(body["startAt"]))
        except ValueError:
            return "startAt harus format tanggal ISO, misalnya 2026-12-10T09:00"
    price = body.get("price", 0)
    if not isinstance(price, int) or isinstance(price, bool) or price < 0:
        return "price harus bilangan bulat >= 0 (0 berarti gratis)"
    quota = body.get("quota", 1)
    if not isinstance(quota, int) or isinstance(quota, bool) or quota < 1:
        return "quota harus bilangan bulat >= 1"
    return None

def lambda_handler(event, context):
    method = event["requestContext"]["http"]["method"]
    path = event["requestContext"]["http"].get("path", "")
    parts = path.strip("/").split("/")          # ["events"], ["events", id], atau ["me", "events"]
    event_id = parts[1] if parts[0] == "events" and len(parts) == 2 else None
    raw = event.get("body") or "{}"
    body = json.loads(base64.b64decode(raw) if event.get("isBase64Encoded") else raw)
    now = datetime.now(timezone.utc).isoformat()
    uid, is_organizer = caller(event)

    if parts not in (["events"], ["me", "events"]) and not event_id:
        return resp(404, {"message": "endpoint tidak ditemukan"})

    # acara milik penyelenggara yang login, termasuk draf
    if method == "GET" and parts == ["me", "events"]:
        if not uid:
            return resp(401, {"message": "login diperlukan"})
        return resp(200, [e for e in load_all() if e.get("organizerId") == uid])

    # katalog publik: draf tidak ditampilkan
    if method == "GET" and not event_id:
        return resp(200, [e for e in load_all() if e.get("status") != "DRAFT"])

    if method == "GET":
        item, _ = load(event_id)
        if not item or item.get("status") == "DRAFT":
            return resp(404, {"message": "acara tidak ditemukan"})
        return resp(200, item)

    if not uid:
        return resp(401, {"message": "login diperlukan"})

    if method == "POST" and not event_id:
        if not is_organizer:
            return resp(403, {"message": "hanya penyelenggara yang boleh membuat acara"})
        if not all(k in body for k in ("title", "category", "venue", "startAt", "price", "quota")):
            return resp(400, {"message": "title, category, venue, startAt, price, dan quota wajib diisi"})
        if invalid(body):
            return resp(400, {"message": invalid(body)})
        item = {k: body[k] for k in FIELDS if k in body and k != "status"}
        item.update(eventId=str(uuid.uuid4()), organizerId=uid, status="DRAFT", sold=0,
                    createdAt=now, updatedAt=now)
        save(item)
        return resp(201, item)

    # PUT dan DELETE: hanya penyelenggara pemilik acara
    current, etag = load(event_id)
    if not current:
        return resp(404, {"message": "acara tidak ditemukan"})
    if current.get("organizerId") != uid:
        return resp(403, {"message": "hanya penyelenggara acara ini yang boleh mengubah atau menghapus"})

    if method == "PUT":
        if invalid(body):
            return resp(400, {"message": invalid(body)})
        if current["status"] == "CANCELLED":
            return resp(409, {"message": "acara yang sudah dibatalkan tidak bisa diubah"})
        if "status" in body and body["status"] not in NEXT_STATUS[current["status"]]:
            return resp(409, {"message": f"status tidak bisa diubah dari {current['status']} ke {body['status']}"})
        if "quota" in body and body["quota"] < current.get("sold", 0):
            return resp(409, {"message": "quota tidak boleh lebih kecil dari tiket yang sudah terjual"})
        item = {**current, **{k: body[k] for k in FIELDS if k in body}, "updatedAt": now}
        try:  # IfMatch: tolak jika acara diubah request lain sejak dibaca (mencegah lost update)
            save(item, IfMatch=etag)
        except ClientError as e:
            if e.response["Error"]["Code"] in ("PreconditionFailed", "ConditionalRequestConflict"):
                return resp(409, {"message": "acara baru saja diubah, muat ulang lalu coba lagi"})
            raise
        return resp(200, item)

    if method == "DELETE":
        if current["status"] != "DRAFT":
            return resp(409, {"message": "hanya acara berstatus DRAFT yang bisa dihapus, batalkan acara yang sudah terbit"})
        s3.delete_object(Bucket=BUCKET, Key=key(event_id))
        return resp(204)

    return resp(405, {"message": "method tidak didukung"})
