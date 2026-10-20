"""Presigned URL ke storage S3-compatible. API tidak pernah menerima file foto."""
from functools import lru_cache

import boto3
from botocore.client import Config
from botocore.exceptions import BotoCoreError, ClientError

from app.core.config import get_settings

PUT_EXPIRES = 15 * 60
GET_EXPIRES = 60 * 60


def _client(endpoint: str):
    s = get_settings()
    return boto3.client(
        "s3",
        endpoint_url=endpoint or None,
        aws_access_key_id=s.s3_access_key or None,
        aws_secret_access_key=s.s3_secret_key or None,
        region_name=s.s3_region,
        config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
    )


@lru_cache
def internal_client():
    return _client(get_settings().s3_endpoint)


@lru_cache
def public_client():
    s = get_settings()
    return _client(s.s3_public_endpoint or s.s3_endpoint)


def presign_put(key: str, content_type: str = "image/jpeg") -> str:
    return public_client().generate_presigned_url(
        "put_object",
        Params={"Bucket": get_settings().s3_bucket, "Key": key, "ContentType": content_type},
        ExpiresIn=PUT_EXPIRES,
    )


def presign_get(key: str) -> str:
    return public_client().generate_presigned_url(
        "get_object", Params={"Bucket": get_settings().s3_bucket, "Key": key}, ExpiresIn=GET_EXPIRES
    )


def object_exists(key: str) -> bool | None:
    """True/False kalau storage bisa dicek, None kalau storage tidak terjangkau."""
    try:
        internal_client().head_object(Bucket=get_settings().s3_bucket, Key=key)
        return True
    except ClientError as e:
        if e.response.get("Error", {}).get("Code") in ("404", "NoSuchKey", "NotFound"):
            return False
        return None
    except BotoCoreError:
        return None


def ensure_bucket() -> None:
    s = get_settings()
    if not s.s3_endpoint:
        return
    c = internal_client()
    try:
        c.head_bucket(Bucket=s.s3_bucket)
    except ClientError:
        c.create_bucket(Bucket=s.s3_bucket)
    except BotoCoreError:
        return
    try:
        c.put_bucket_cors(Bucket=s.s3_bucket, CORSConfiguration={"CORSRules": [{
            "AllowedOrigins": ["*"], "AllowedMethods": ["GET", "PUT", "HEAD"],
            "AllowedHeaders": ["*"], "MaxAgeSeconds": 3600,
        }]})
    except (ClientError, BotoCoreError):
        pass
