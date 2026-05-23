# LLM 双通道路由说明

学径**不内置本地大模型权重**，通过 OpenAI 兼容 HTTP 调用云端 API，避免仓库体积膨胀。

## 路由规则

| 场景 | 主通道（画像 / 辅导 / 对话） | 辅助通道（推荐文案 / 质检） |
|------|------------------------------|-----------------------------|
| 已配置 `SPARK_API_KEY` | 讯飞星火 | `AUX_LLM_*` 云端模型 |
| 未配置星火，已配置 `AUX_LLM_API_KEY` | 辅助云端模型 | 辅助云端模型 |
| `LLM_MOCK=true` | Mock 文本 | Mock 文本 |
| 无任何 Key | Mock 文本 | Mock 文本 |

## 推荐云端辅助服务（任选其一）

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
