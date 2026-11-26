"""Unit test auth-service dengan S3 tiruan (moto). Jalankan: pytest services"""
import base64
import importlib.util
import json
import os

import boto3
import pytest
from moto import mock_aws

SRC = os.path.join(os.path.dirname(__file__), "..", "src", "handler.py")
os.environ.update(DATA_BUCKET="eventory-data-test", TOKEN_SECRET="rahasia-uji",
                  AWS_DEFAULT_REGION="us-east-1", AWS_ACCESS_KEY_ID="test", AWS_SECRET_ACCESS_KEY="test")


@pytest.fixture
def h():
    with mock_aws():
        boto3.client("s3").create_bucket(Bucket="eventory-data-test")
        spec = importlib.util.spec_from_file_location("auth_handler", SRC)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        yield module


def call(h, path, body, method="POST"):
    event = {"requestContext": {"http": {"method": method, "path": path}}, "body": json.dumps(body)}
    res = h.lambda_handler(event, None)
    return res["statusCode"], json.loads(res["body"])


USER = {"email": "Budi@Mail.UGM.ac.id", "password": "rahasia123"}


def test_register_then_login(h):
    code, out = call(h, "/auth/register", USER)
    assert code == 201 and out["email"] == "budi@mail.ugm.ac.id"
    code, out = call(h, "/auth/login", {**USER, "email": "budi@mail.ugm.ac.id"})
    assert code == 200 and out["isOrganizer"] is False
    payload, sig = out["token"].split(".")
    claims = json.loads(base64.urlsafe_b64decode(payload))
    assert claims["sub"] == out["sub"] and claims["org"] is False and len(sig) == 64


def test_password_not_stored_plain(h):
    call(h, "/auth/register", USER)
    raw = h.s3.get_object(Bucket="eventory-data-test", Key="users/budi@mail.ugm.ac.id.json")["Body"].read()
    assert b"rahasia123" not in raw


def test_duplicate_email(h):
    assert call(h, "/auth/register", USER)[0] == 201
    assert call(h, "/auth/register", USER)[0] == 409


def test_organizer_flag_goes_into_token(h):
    call(h, "/auth/register", USER)
    key = "users/budi@mail.ugm.ac.id.json"
    user = json.loads(h.s3.get_object(Bucket="eventory-data-test", Key=key)["Body"].read())
    h.s3.put_object(Bucket="eventory-data-test", Key=key, Body=json.dumps({**user, "isOrganizer": True}))
    assert call(h, "/auth/login", USER)[1]["isOrganizer"] is True


@pytest.mark.parametrize("body", [
    {"email": "bukan-email", "password": "rahasia123"},
    {"email": "a@b.co", "password": "pendek1"},
    {"email": "a@b.co", "password": "tanpaangka"},
])
def test_register_invalid(h, body):
    assert call(h, "/auth/register", body)[0] == 400


def test_login_wrong_password_or_unknown_email(h):
    call(h, "/auth/register", USER)
    assert call(h, "/auth/login", {**USER, "password": "salah12345"})[0] == 401
    assert call(h, "/auth/login", {"email": "tidak@ada.id", "password": "rahasia123"})[0] == 401


def test_token_accepted_by_event_service(h):
    """Kontrak antar service: token dari auth-service harus diterima event-service."""
    path = os.path.join(os.path.dirname(__file__), "..", "..", "event-service", "src", "handler.py")
    spec = importlib.util.spec_from_file_location("event_handler_contract", path)
    events = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(events)
    call(h, "/auth/register", USER)
    tok = call(h, "/auth/login", USER)[1]["token"]
    sub, is_org = events.caller({"headers": {"authorization": "Bearer " + tok}})
    assert sub and is_org is False
