# Session Summary

## 日期
- 2026-07-14

## 本次完成
- 通读项目核心结构、README、前后端配置与近期更新文档，完成阶段 0 全局掌握。
- 复核 `docs/10-竞品脑暴与产品优化方向.md` 的全部优化点，并与当前代码实现逐项比对。
- 确认项目当前为 LearnPath 产品化迭代版本：前后端主干、路径重规划、AI 课堂、实时画像、资源库、学习成就馆、后台管理等能力已具备。
- 识别出文档中的多个 P0 优化点已部分落地，不应按“从零开发”处理：
  - 连续学习 streak：已在侧栏学习统计中展示。
  - 今日最小任务：已在路径页顶部展示。
  - 掌握度反馈：已在路径步骤中接入，后端已有复习调度逻辑。
  - 复习卡：已支持按主题生成，但“从模板创建”尚未真正落地。
- 已按用户确认方案进入阶段 1 执行，并完成以下实现：
  - 模板中心 C 方案：新增可配置内置模板注册、模板列表接口、模板实例化接口，资源页新增“模板中心”入口，支持一键创建“机器学习高频概念”“Python 基础语法”模板学习集。
  - 今日最小任务闭环：任务卡优先取当前路径节点关联的小测与复习资源，点击“小测”可真实进入对应资源，不再停留在占位提示。
  - 掌握度完整改造 C 方案（当前完成核心闭环）：掌握度按钮文案统一为“忘了 / 模糊 / 会了”；新增侧栏“待复习”队列；掌握度条可识别复习是否到期。
  - 薄弱点 B 方案：画像页新增“薄弱知识点 Top 5”与强弱评分条，并支持逐项触发“生成补弱路径”重规划任务。
  - AI 课堂三段式：后端课堂 slide schema 新增 `intuition / worked_example / quick_check` 三段式字段；fallback 课堂、LLM 约束和前端课堂展示统一固定为“直觉 -> 例题 -> 随堂练习”。
  - 路径阶段看板：路径页新增“时间线 / 阶段看板”双视图切换，可按待开始 / 进行中 / 已完成三列浏览节点，并直接查看详情、标记完成。
  - 评估页周复盘：新增后端周复盘生成接口，点击可产出 Markdown 复盘资源并直达资源详情页。
  - 资源详情四模式：同一资源新增“讲解 / 速记 / 测验 / 错题”四模式切换。
  - 资源详情一键生成 5 张复习卡：基于当前资源标题、主题和知识点批量生成复习卡。
  - 顺手修复：`eval_cache` 现已真正写入用户偏好，不再出现“评估建议只写不存”的问题。
  - 浏览器层回归验证：启动前后端后，实测通过了路径页今日最小任务、掌握度反馈、待复习队列、路径阶段看板、AI课堂三段式、评估页周复盘、资源详情四模式、资源详情批量生成复习卡等关键链路。
  - 回归修复：浏览器验证发现“薄弱知识点 Top 5”仅出现在长期画像页，不符合文档要求；已补到实时画像页，并重新验证通过。
  - 阶段 2 已落地本轮批准范围：
    - 首页“今日学习中枢”上线，整合连续学习、待复习、建议时长与快捷入口。
    - 评估页新增三张纯图表：遗忘风险、复习压力、保持趋势，并加入压力平衡建议。
    - 模板中心补齐“创建前定制”闭环：用户可先改学习集标题和主题，再复制整套模板资源。
    - 资源详情页新增“训练 / 卡片”双视图：前者用于逐点自测，后者用于图像化速记与 20 秒快检。
  - 阶段 2 浏览器回归通过：
    - 资源页可正常打开模板定制弹窗并创建资源。
    - 新建资源可直接进入详情页，正常切换“训练 / 卡片”视图并继续操作。
  - 交付前性能收尾：
    - `backend/app/services/path_resource_regen_service.py`：把路径资源重生成里每阶段的“资源类型规划 + 阶段资料检索”改为并行预处理，减少整条链路的串行等待。
    - `backend/app/services/resource_service.py`：合并流式资源生成在路径挂载场景下的重复落库 / 索引更新，减少一次完整 I/O。
    - `frontend/src/components/AppShell.tsx`、`frontend/src/lib/routePreload.ts`：把登录后非关键预热改为空闲期后台执行，不再阻塞主应用首轮进入。
  - 交付前全量浏览器回归（当前可用环境）：
    - 实测通过聊天首页“今日学习中枢”、学习画像“薄弱知识点 Top 5”、学习路径“今日最小任务”、资源页“模板中心”、评估页“未来 7 天遗忘风险”入口存在与加载。
    - 实测通过资源详情“训练 / 卡片”切换链路。

## 本次未做
- 未新增后端业务单测执行，原因仍是当前环境缺少 `pydantic`。
- 未完成 Chrome / Firefox / Edge / Safari 最新 3 个版本的真实浏览器矩阵验证，原因是当前集成环境仅提供单一浏览器执行能力。

## 已定位的关键文件
- 前端侧栏与 streak：`frontend/src/components/AppSidebar.tsx`、`frontend/src/components/SidebarStudyStats.tsx`
- 路径页与今日最小任务：`frontend/src/components/pages/PathContent.tsx`、`frontend/src/components/PathDailyMinimumCard.tsx`
- 掌握度反馈：`frontend/src/components/MasteryFeedbackBar.tsx`
- 资源页与复习卡入口：`frontend/src/components/pages/ResourcesContent.tsx`、`frontend/src/components/ReviewCardGenerateModal.tsx`
- 用户画像页：`frontend/src/components/pages/ProfileContent.tsx`
- 后端掌握度服务：`backend/app/services/mastery_service.py`
- 路径掌握度接口：`backend/app/api/routes/path.py`
- 复习卡接口：`backend/app/api/routes/review_cards.py`
- 模板相关 Schema（仅定义，未落地）：`backend/app/models/schemas.py`
- 模板中心服务：`backend/app/services/resource_template_service.py`
- 模板中心前端：`frontend/src/components/ResourceTemplateCenter.tsx`
- 模板中心 API 封装：`frontend/src/lib/api.ts`
- 侧栏待复习队列：`frontend/src/components/SidebarReviewQueue.tsx`
- 薄弱点画像入口：`frontend/src/components/pages/ProfileContent.tsx`
- 路径阶段看板：`frontend/src/components/pages/PathContent.tsx`
- 评估页周复盘：`frontend/src/components/pages/EvaluationContent.tsx`、`backend/app/services/eval_stats_service.py`、`backend/app/api/routes/eval.py`
- 资源详情四模式：`frontend/src/components/ResourceDetailPage.tsx`
- AI 课堂三段式：`backend/app/services/classroom_service.py`、`frontend/src/components/pages/ClassroomContent.tsx`
- 首页今日学习中枢：`frontend/src/components/pages/ChatContent.tsx`
- 资源详情训练/卡片视图：`frontend/src/components/ResourceDetailPage.tsx`
- 路径资源重生成提速：`backend/app/services/path_resource_regen_service.py`
- 登录后预热策略：`frontend/src/components/AppShell.tsx`、`frontend/src/lib/routePreload.ts`

## 关键判断
- 阶段 1 应按“已存在 / 待补强 / 待新增”三类推进，而不是直接照文档逐项重做。
- “从模板创建”存在明确缺口：仅有 Schema 预留，没有后端服务、路由和前端入口闭环。
- “掌握度反馈”的按钮文案与文档不一致；当前为“一般 / 较好 / 很好”，文档期望更偏复习语义。
- “今日最小任务”里的小测入口当前仍是占位提示，属于已上线框架但未完成闭环。
- “薄弱知识点 Top 5 + 生成补弱路径”在画像页尚未看到成型入口。
- `next lint` 当前无法直接作为非交互测试使用，因为前端仓库未初始化 ESLint，执行会进入向导。
- 阶段 2 本轮批准范围已经闭环，后续优先级更适合转向体验打磨与测试基建补齐。
- 当前环境可以完成高可信的单浏览器真实回归，但不能据实宣称已经完成 12 版本跨浏览器矩阵验证。

## 下一步
- 等待用户决定是否继续做体验打磨、补测试基建，或开启新的优化主题。

## 本轮测试结果
- `python -m py_compile backend/app/services/resource_template_service.py backend/app/api/routes/resources.py backend/tests/test_resource_workflow.py`：通过
- `npx tsc -p tsconfig.json --noEmit`（`frontend/`）：通过
- `python -m py_compile backend/app/models/schemas.py backend/app/db/repository.py backend/app/services/classroom_service.py backend/app/services/eval_stats_service.py backend/app/api/routes/eval.py`：通过
- `d:\A3\backend\.venv\Scripts\python.exe -m py_compile backend/app/services/resource_template_service.py backend/app/api/routes/resources.py backend/app/models/schemas.py backend/tests/test_resource_workflow.py`：通过
- `npx tsc -p tsconfig.json --noEmit`（`frontend/`，阶段 2 收尾复验）：通过
- `d:\A3\backend\.venv\Scripts\python.exe -m py_compile backend/app/services/path_resource_regen_service.py backend/app/services/resource_service.py backend/app/services/eval_stats_service.py`：通过
- `npx tsc -p tsconfig.json --noEmit`（`frontend/`，性能收尾后复验）：通过
- `python -m unittest tests.test_resource_workflow`（`backend/`）：未通过，原因是当前环境缺少 `pydantic`
- `npm run lint`（`frontend/`）：未执行成功，原因是仓库尚未完成 ESLint 初始化，命令进入交互向导
- 浏览器层回归：通过，期间发现并修复“薄弱知识点 Top 5”落位错误
- 浏览器层回归（阶段 2 收尾）：通过，模板定制创建与资源详情训练/卡片视图正常
- 浏览器层回归（交付前全量主模块巡检）：通过，已覆盖聊天 / 画像 / 路径 / 资源 / 评估主模块与阶段 2 核心入口

## 当前改动文件
- `backend/app/api/routes/resources.py`
- `backend/app/services/resource_template_service.py`
- `backend/tests/test_resource_workflow.py`
- `frontend/src/lib/api.ts`
- `frontend/src/lib/masteryStorage.ts`
- `frontend/src/lib/dailyMinimumTasks.ts`
- `frontend/src/components/ResourceTemplateCenter.tsx`
- `frontend/src/components/pages/ResourcesContent.tsx`
- `frontend/src/components/PathDailyMinimumCard.tsx`
- `frontend/src/components/MasteryFeedbackBar.tsx`
- `frontend/src/components/SidebarReviewQueue.tsx`
- `frontend/src/components/AppSidebar.tsx`
- `frontend/src/components/pages/ProfileContent.tsx`
- `frontend/src/components/pages/ClassroomContent.tsx`
- `frontend/src/components/pages/EvaluationContent.tsx`
- `frontend/src/components/pages/PathContent.tsx`
- `frontend/src/components/ResourceDetailPage.tsx`
- `frontend/src/app/globals.css`
- `backend/app/models/schemas.py`
- `backend/app/db/repository.py`
- `backend/app/services/classroom_service.py`
- `backend/app/services/eval_stats_service.py`
- `backend/app/services/path_resource_regen_service.py`
- `backend/app/services/resource_service.py`
- `frontend/src/components/AppShell.tsx`
- `frontend/src/lib/routePreload.ts`
- `backend/app/api/routes/eval.py`
- `memory-bank/progress.md`
- `memory-bank/session-summary.md`
