# LLM 双通道路由说明

学径**不内置本地大模型权重**，通过 OpenAI 兼容 HTTP 调用云端 API。

## 路由规则（优先级从高到低）

| 场景 | 条件 | 主通道 | 辅助通道 |
|------|------|--------|----------|
| Kimi 测试/生产 | 已配置 `KIMI_API_KEY` | Kimi | Kimi（同一模型） |
| 星火 + 辅助 | 有星火 + 有 AUX | 讯飞星火 | 辅助云端 |
| 仅辅助 | 无星火，有 AUX | 辅助云端 | 辅助云端 |
| Mock | `LLM_MOCK=true` 或无 Key | Mock | Mock |

详见 [08-Kimi接入与Prompt说明.md](./08-Kimi接入与Prompt说明.md)。

## Kimi（Moonshot）示例

```env
LLM_MOCK=false
KIMI_API_KEY=你的密钥
KIMI_BASE_URL=https://api.moonshot.cn/v1
KIMI_MODEL=moonshot-v1-32k
```

## 其他云端辅助服务（任选其一）

1. **硅基流动**（默认示例）：<https://cloud.siliconflow.cn>  
   - `AUX_LLM_BASE_URL=https://api.siliconflow.cn/v1`  
   - `AUX_LLM_MODEL=Qwen/Qwen2.5-7B-Instruct`

2. **DeepSeek**：  
   - `AUX_LLM_BASE_URL=https://api.deepseek.com/v1`  
   - `AUX_LLM_MODEL=deepseek-chat`

3. **Groq / OpenRouter** 等：填写对应 Base URL 与模型名即可。

## 配置示例

```env
LLM_MOCK=false
SPARK_API_KEY=你的星火密钥
AUX_LLM_API_KEY=你的硅基流动或DeepSeek密钥
AUX_LLM_BASE_URL=https://api.siliconflow.cn/v1
AUX_LLM_MODEL=Qwen/Qwen2.5-7B-Instruct
```

## 运行时检查

`GET /api/health` 返回 `llm` 字段，例如：

```json
{
  "status": "ok",
  "llm": {
    "routing": "spark_primary_aux_secondary",
    "primary_provider": "spark",
    "aux_provider": "aux"
  }
}
```

对话页状态栏会显示当前路由模式（如「星火主 · 辅助模型推荐」）。
