"""Unit test media-service dengan S3 tiruan (moto). Jalankan: pytest services/media-service/tests"""
import base64
import hashlib
import hmac
import importlib.util
import json
import os
import time
import urllib.parse

import boto3
import pytest
from moto import mock_aws

SRC = os.path.join(os.path.dirname(__file__), "..", "src", "handler.py")
os.environ.update(PHOTO_BUCKET="eventory-photos-test", PHOTO_BASE_URL="https://d111.cloudfront.net/", TOKEN_SECRET="rahasia-uji",
                  AWS_DEFAULT_REGION="us-east-1", AWS_ACCESS_KEY_ID="test", AWS_SECRET_ACCESS_KEY="test")


@pytest.fixture
def h():
    with mock_aws():
        boto3.client("s3").create_bucket(Bucket="eventory-photos-test")
        spec = importlib.util.spec_from_file_location("media_handler", SRC)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        yield module


def token(sub):
    claims = {"sub": sub, "email": f"{sub}@uji.test", "org": False, "exp": int(time.time()) + 3600}
    payload = base64.urlsafe_b64encode(json.dumps(claims).encode()).decode()
    return payload + "." + hmac.new(b"rahasia-uji", payload.encode(), hashlib.sha256).hexdigest()


def call(h, body, user="user-a"):
    headers = {"authorization": "Bearer " + token(user)} if user else {}
    event = {"requestContext": {"http": {"method": "POST", "path": "/uploads"}},
             "headers": headers, "body": json.dumps(body)}
    res = h.lambda_handler(event, None)
    return res["statusCode"], json.loads(res["body"])


def test_presigned_url(h):
    code, out = call(h, {"contentType": "image/jpeg"})
    assert code == 200
    assert out["key"].startswith("photos/user-a/") and out["key"].endswith(".jpg")
    assert out["photoUrl"] == "https://d111.cloudfront.net/" + out["key"]
    url = urllib.parse.urlparse(out["uploadUrl"])
    assert "eventory-photos-test" in url.netloc + url.path
    assert "X-Amz-Signature" in url.query


def test_rejects_non_image(h):
    assert call(h, {"contentType": "application/pdf"})[0] == 400
    assert call(h, {})[0] == 400


def test_requires_login(h):
    assert call(h, {"contentType": "image/png"}, user=None)[0] == 401
