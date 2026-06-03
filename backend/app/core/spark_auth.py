"""讯飞开放平台 HTTP 接口鉴权（HMAC-SHA256）。"""

from __future__ import annotations

import base64
import hashlib
import hmac
from datetime import datetime
from time import mktime
from urllib.parse import urlencode, urlparse
from wsgiref.handlers import format_date_time


def assemble_spark_auth_url(request_url: str, *, method: str = "POST", api_key: str, api_secret: str) -> str:
    """为讯飞 HTTP API 生成带 authorization  query 的完整 URL。"""
    parsed = urlparse(request_url)
    host = parsed.hostname or ""
    path = parsed.path or "/"

    now = datetime.now()
    date = format_date_time(mktime(now.timetuple()))

    signature_origin = f"host: {host}\ndate: {date}\n{method.upper()} {path} HTTP/1.1"
    signature_sha = hmac.new(
        api_secret.encode("utf-8"),
        signature_origin.encode("utf-8"),
        digestmod=hashlib.sha256,
    ).digest()
    signature_b64 = base64.b64encode(signature_sha).decode("utf-8")

    authorization_origin = (
        f'api_key="{api_key}", algorithm="hmac-sha256", '
        f'headers="host date request-line", signature="{signature_b64}"'
    )
    authorization = base64.b64encode(authorization_origin.encode("utf-8")).decode("utf-8")

    query = urlencode({"host": host, "date": date, "authorization": authorization})
    return f"{parsed.scheme}://{host}{path}?{query}"
