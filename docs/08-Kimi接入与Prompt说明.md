# Kimi（Moonshot）接入与 Agent Prompt 说明

## 1. Kimi API 配置

学径通过 **OpenAI 兼容接口** 调用 Kimi。配置根目录 `.env`：

```env
LLM_MOCK=false
KIMI_API_KEY=你的_Moonshot_API_Key
KIMI_BASE_URL=https://api.moonshot.cn/v1
KIMI_MODEL=moonshot-v1-32k
```

配置 `KIMI_API_KEY` 后，**所有 LLM 任务**（画像、辅导、资源生成、资料库分析、路径规划、评估建议、推荐润色、质检）均走 Kimi，优先级高于星火与 `AUX_LLM_*`。

验证：`GET http://127.0.0.1:8000/api/health` 应返回 `"routing": "kimi_all"`。

> **安全提示**：请勿将真实 API Key 提交到 Git；仅保存在本地 `.env`。

## 2. 资料库上传格式

支持常见教学文件（见 `GET /api/libraries/supported-formats`）：

| 类型 | 扩展名 |
|------|--------|
| PDF | `.pdf` |
| Word | `.docx`（`.doc` 请另存为 docx） |
| PPT | `.pptx`（`.ppt` 请另存为 pptx） |
| Excel | `.xlsx`（`.xls` 请另存为 xlsx） |
| 文本/代码 | `.md` `.txt` `.py` `.java` `.json` 等 |

上传后由 Kimi 分析文件结构并写入 RAG 向量库，供资源生成引用。

## 3. Agent Prompt 一览

所有 System Prompt 集中在 `backend/app/core/prompts.py`：

| 场景 | 函数 / 常量 | 使用位置 |
|------|-------------|----------|
| 对话意图路由 | `INTENT_CLASSIFY_SYSTEM` | 预留 / 文档 |
| 学习画像 | `profile_system()` | `profile_agent` |
| 智能辅导 | `tutor_system()` | `tutor_llm` / `/api/tutor` |
| 学习路径规划 | `path_planning_system()` | `path_agent` |
| 学习评估建议 | `eval_advice_system()` | `eval_agent` |
| 资源生成 | `resource_generation_system()` | `_resource_base` |
| 资料库单文件分析 | `LIBRARY_FILE_ANALYSIS_SYSTEM` | `library_ingest_service` |
| 资料库合成 | `LIBRARY_SYNTHESIS_SYSTEM` | `library_ingest_service` |
| 全网检索规划 | `WEB_RESEARCH_PLAN_SYSTEM` | `web_research_service` |
| 全网资料整理 | `WEB_RESEARCH_SYNTHESIS_SYSTEM` | `web_research_service` |
| 资料库补充 | `WEB_SUPPLEMENT_SYSTEM` | `resource_context_service` |
| 资源质检 | `reviewer_system()` | `reviewer_agent` |
| 推荐语润色 | `recommendation_polish_system()` | `recommendation_service` |

用户可见的完成说明（非 LLM）见 `chat_reply_hint()`。

## 4. 修改 Prompt

1. 编辑 `backend/app/core/prompts.py` 对应常量或函数。
2. 重启后端（或 `DEV_RELOAD=true` 时保存后自动 reload）。
3. 在对话 / 资源库生成 / 资料库上传中验证效果。

深度思考模式会在画像、辅导、路径、评估等 Prompt 末尾追加 `DEEP_THINKING_APPEND` 段落。
