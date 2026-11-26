"""Unit test event-service dengan S3 tiruan (moto). Jalankan: pytest services"""
import base64
import hashlib
import hmac
import importlib.util
import json
import os
import time

import boto3
import pytest
from moto import mock_aws

SRC = os.path.join(os.path.dirname(__file__), "..", "src", "handler.py")
os.environ.update(DATA_BUCKET="eventory-data-test", TOKEN_SECRET="rahasia-uji",
                  AWS_DEFAULT_REGION="us-east-1", AWS_ACCESS_KEY_ID="test", AWS_SECRET_ACCESS_KEY="test")


def token(sub, org, exp=None, secret=b"rahasia-uji"):
    """Token dengan format yang sama seperti buatan auth-service."""
    claims = {"sub": sub, "email": f"{sub}@uji.test", "org": org, "exp": exp or int(time.time()) + 3600}
    payload = base64.urlsafe_b64encode(json.dumps(claims).encode()).decode()
    return payload + "." + hmac.new(secret, payload.encode(), hashlib.sha256).hexdigest()


@pytest.fixture
def h():
    with mock_aws():
        boto3.client("s3").create_bucket(Bucket="eventory-data-test")
        spec = importlib.util.spec_from_file_location("event_handler", SRC)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        yield module


def call(h, method, item_id=None, body=None, user="org-a", org=True, path=None, auth=None):
    event = {"requestContext": {"http": {"method": method,
                                         "path": path or ("/events/" + item_id if item_id else "/events")}},
             "headers": {},
             "body": json.dumps(body) if body is not None else None}
    if auth or user:
        event["headers"]["authorization"] = "Bearer " + (auth or token(user, org))
    res = h.lambda_handler(event, None)
    return res["statusCode"], json.loads(res["body"]) if res["body"] else None


NEW = {"title": "Seminar Cloud Computing 2026", "category": "SEMINAR", "venue": "Auditorium Merapi",
       "startAt": "2026-12-10T09:00", "price": 25000, "quota": 150}


def publish(h, event_id, user="org-a"):
    return call(h, "PUT", event_id, {"status": "PUBLISHED"}, user=user)


def test_create_starts_as_draft(h):
    code, e = call(h, "POST", body={**NEW, "status": "PUBLISHED", "sold": 99})
    assert code == 201 and e["status"] == "DRAFT" and e["sold"] == 0 and e["organizerId"] == "org-a"


def test_draft_hidden_from_public_until_published(h):
    _, e = call(h, "POST", body=NEW)
    assert call(h, "GET", e["eventId"], user=None)[0] == 404
    assert call(h, "GET", user=None)[1] == []
    assert publish(h, e["eventId"])[0] == 200
    code, got = call(h, "GET", e["eventId"], user=None)
    assert code == 200 and got["status"] == "PUBLISHED"
    assert len(call(h, "GET", user=None)[1]) == 1


def test_my_events_includes_drafts(h):
    call(h, "POST", body=NEW)
    call(h, "POST", body={**NEW, "title": "Lomba UI/UX"}, user="org-b")
    code, mine = call(h, "GET", path="/me/events")
    assert code == 200 and len(mine) == 1 and mine[0]["title"] == NEW["title"]
    assert call(h, "GET", path="/me/events", user=None)[0] == 401


def test_only_organizer_group_can_create(h):
    assert call(h, "POST", body=NEW, user="peserta-1", org=False)[0] == 403
    assert call(h, "POST", body=NEW, user=None)[0] == 401


def test_update_by_organizer(h):
    _, e = call(h, "POST", body=NEW)
    code, upd = call(h, "PUT", e["eventId"], {"quota": 200, "price": 20000})
    assert code == 200 and upd["quota"] == 200 and upd["price"] == 20000
    _, upd = call(h, "PUT", e["eventId"], {"sold": 99})
    assert upd["sold"] == 0  # sold hanya diubah oleh service pemesanan


def test_status_flow(h):
    _, e = call(h, "POST", body=NEW)
    assert call(h, "PUT", e["eventId"], {"status": "CANCELLED"})[0] == 409    # DRAFT tidak langsung batal
    assert publish(h, e["eventId"])[0] == 200
    assert call(h, "PUT", e["eventId"], {"status": "DRAFT"})[0] == 409        # tidak bisa kembali ke draf
    assert call(h, "PUT", e["eventId"], {"status": "CANCELLED"})[0] == 200
    assert call(h, "PUT", e["eventId"], {"price": 1})[0] == 409               # batal bersifat final


def test_delete_only_draft(h):
    _, e = call(h, "POST", body=NEW)
    assert call(h, "DELETE", e["eventId"])[0] == 204
    _, e2 = call(h, "POST", body=NEW)
    publish(h, e2["eventId"])
    assert call(h, "DELETE", e2["eventId"])[0] == 409


def test_only_owner_can_modify(h):
    _, e = call(h, "POST", body=NEW, user="org-a")
    assert call(h, "PUT", e["eventId"], {"price": 1}, user="org-b")[0] == 403
    assert call(h, "DELETE", e["eventId"], user="org-b")[0] == 403
    assert call(h, "PUT", e["eventId"], {"price": 1}, user=None)[0] == 401


def test_quota_not_below_sold(h):
    _, e = call(h, "POST", body=NEW)
    h.save({**h.load(e["eventId"])[0], "sold": 30})  # disimulasikan dari service pemesanan
    assert call(h, "PUT", e["eventId"], {"quota": 20})[0] == 409
    assert call(h, "PUT", e["eventId"], {"quota": 30})[0] == 200


@pytest.mark.parametrize("body", [
    {"title": "X"},                                       # field wajib kurang
    {**NEW, "category": "PESTA"},                         # kategori salah
    {**NEW, "price": -5000},                              # harga negatif
    {**NEW, "quota": 0},                                  # kuota nol
    {**NEW, "startAt": "besok pagi"},                     # tanggal tidak valid
    {**NEW, "venue": " "},                                # tempat kosong
])
def test_create_invalid(h, body):
    assert call(h, "POST", body=body)[0] == 400


def test_not_found(h):
    assert call(h, "GET", "tidak-ada")[0] == 404
    assert call(h, "GET", "00000000-0000-0000-0000-000000000000")[0] == 404
    assert call(h, "PUT", "tidak-ada", {"price": 1})[0] == 404
    assert call(h, "DELETE", "tidak-ada")[0] == 404


def test_rejects_forged_or_expired_token(h):
    assert call(h, "POST", body=NEW, auth=token("org-a", True, secret=b"tebakan"))[0] == 401
    assert call(h, "POST", body=NEW, auth=token("org-a", True, exp=int(time.time()) - 1))[0] == 401
    assert call(h, "POST", body=NEW, auth="bukan-token")[0] == 401


def test_update_rejected_if_changed_meanwhile(h):
    _, e = call(h, "POST", body=NEW)
    real_load = h.load
    stale = real_load(e["eventId"])
    h.save({**stale[0], "price": 1})       # request lain mengubah acara di antara baca dan tulis
    h.load = lambda _id: stale
    try:
        assert call(h, "PUT", e["eventId"], {"price": 2})[0] == 409
    finally:
        h.load = real_load
