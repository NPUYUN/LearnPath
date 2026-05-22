"""
讯飞星火 API 客户端封装
文档：https://www.xfyun.cn/doc/spark/Web.html

TODO（开发者任务）：
1. 完善 WebSocket 连接鉴权逻辑（HMAC-SHA256 签名）
2. 实现 stream=True 时的异步生成器
3. 添加重试机制（max_retries=3）
4. 添加 token 用量统计日志
"""
import hmac
import hashlib
import base64
import json
import time
import asyncio
import websockets
from datetime import datetime
from urllib.parse import urlencode, urlparse
from typing import AsyncGenerator, List

from backend.core.config import settings


class SparkLLM:
    """
    讯飞星火大模型客户端
    支持流式和非流式调用
    """

    # 各版本对应的 WebSocket URL
    DOMAIN_URL_MAP = {
        "lite": "wss://spark-api.xf-yun.com/v1.1/chat",
        "generalv3": "wss://spark-api.xf-yun.com/v3.1/chat",
        "pro-128k": "wss://spark-api.xf-yun.com/pro128k/chat",
        "generalv3.5": "wss://spark-api.xf-yun.com/v3.5/chat",
        "max-32k": "wss://spark-api.xf-yun.com/max32k/chat",
        "4.0Ultra": "wss://spark-api.xf-yun.com/v4.0/chat",
    }

    def __init__(self):
        self.app_id = settings.SPARK_APP_ID
        self.api_key = settings.SPARK_API_KEY
        self.api_secret = settings.SPARK_API_SECRET
        self.domain = settings.SPARK_DOMAIN
        self.url = self.DOMAIN_URL_MAP.get(self.domain, self.DOMAIN_URL_MAP["4.0Ultra"])

    def _build_auth_url(self) -> str:
        """
        构建带鉴权信息的 WebSocket URL
        参考：https://www.xfyun.cn/doc/spark/general_url_authentication.html
        
        TODO: 实现完整的 HMAC-SHA256 URL 鉴权
        """
        # 生成 RFC1123 格式时间
        now = datetime.now()
        date = now.strftime("%a, %d %b %Y %H:%M:%S GMT")

        parsed = urlparse(self.url)
        signature_origin = f"host: {parsed.netloc}\ndate: {date}\nGET {parsed.path} HTTP/1.1"
        
        signature_sha = hmac.new(
            self.api_secret.encode("utf-8"),
            signature_origin.encode("utf-8"),
            digestmod=hashlib.sha256,
        ).digest()
        signature = base64.b64encode(signature_sha).decode()
        
        authorization_origin = (
            f'api_key="{self.api_key}", algorithm="hmac-sha256", '
            f'headers="host date request-line", signature="{signature}"'
        )
        authorization = base64.b64encode(authorization_origin.encode()).decode()
        
        params = {"authorization": authorization, "date": date, "host": parsed.netloc}
        return f"{self.url}?{urlencode(params)}"

    def _build_request_body(self, messages: List[dict], **kwargs) -> dict:
        """构建 Spark API 请求体"""
        return {
            "header": {"app_id": self.app_id},
            "parameter": {
                "chat": {
                    "domain": self.domain,
                    "temperature": kwargs.get("temperature", 0.5),
                    "max_tokens": kwargs.get("max_tokens", settings.MAX_GENERATION_TOKENS),
                }
            },
            "payload": {"message": {"text": messages}},
        }

    async def achat(
        self,
        messages: List[dict],
        **kwargs,
    ) -> AsyncGenerator[str, None]:
        """
        异步流式调用 Spark API
        
        Args:
            messages: 对话历史，格式 [{"role": "user", "content": "..."}]
        
        Yields:
            str: 流式返回的文本片段
        
        TODO: 处理连接断开重连逻辑
        """
        auth_url = self._build_auth_url()
        request_body = self._build_request_body(messages, **kwargs)

        async with websockets.connect(auth_url) as ws:
            await ws.send(json.dumps(request_body))
            
            while True:
                response = await ws.recv()
                data = json.loads(response)
                
                header = data.get("header", {})
                if header.get("code") != 0:
                    raise RuntimeError(
                        f"Spark API error {header.get('code')}: {header.get('message')}"
                    )
                
                choices = data.get("payload", {}).get("choices", {})
                text_list = choices.get("text", [])
                
                for item in text_list:
                    yield item.get("content", "")
                
                # status=2 表示最后一条消息
                if header.get("status") == 2:
                    break

    async def chat(self, messages: List[dict], **kwargs) -> str:
        """
        非流式调用（收集所有流式输出后返回完整文本）
        
        TODO: 添加超时控制
        """
        full_response = ""
        async for chunk in self.achat(messages, **kwargs):
            full_response += chunk
        return full_response


# 全局单例
spark_llm = SparkLLM()
