"""资源模板中心：内置可扩展模板注册与实例化逻辑。"""

from __future__ import annotations

from copy import deepcopy
import uuid

from app.db.repository import record_event, save_resources
from app.models.schemas import CreateFromTemplateResponse, ResourceTemplateInfo
from app.services.resource_metadata_service import with_resource_metadata


def _template_resource(
    *,
    resource_type: str,
    title: str,
    topic: str,
    content: str,
    learning_purpose: str,
    estimated_minutes: int,
    quality_tags: list[str],
    knowledge_points: list[str],
) -> dict:
    return {
        "type": resource_type,
        "title": title,
        "topic": topic,
        "content": content.strip(),
        "sources": ["内置模板中心"],
        "generation_mode": "template",
        "metadata": {
            "learning_purpose": learning_purpose,
            "estimated_minutes": estimated_minutes,
            "knowledge_points": knowledge_points,
            "quality_score": 8.8,
            "quality_tags": ["模板学习集", *quality_tags],
            "classroom_ready": resource_type in {"doc", "ppt", "quiz"},
            "generated_context": {
                "topic": topic,
                "generation_mode": "template",
                "template": True,
            },
        },
    }


TEMPLATE_REGISTRY: dict[str, dict] = {
    "ml-core-concepts": {
        "info": {
            "id": "ml-core-concepts",
            "title": "机器学习高频概念",
            "subtitle": "适合开学导入、期中复习和答辩演示的速学模板",
            "topic": "机器学习基础概念",
            "tags": ["机器学习", "高频概念", "复习模板"],
            "resource_count": 4,
            "estimated_minutes": 36,
            "icon": "bulb",
            "color": "#1677ff",
        },
        "resources": [
            _template_resource(
                resource_type="doc",
                title="机器学习高频概念 · 讲解文档",
                topic="机器学习基础概念",
                learning_purpose="explain",
                estimated_minutes=10,
                quality_tags=["高频概念", "课堂可用"],
                knowledge_points=["监督学习", "训练集与测试集", "过拟合", "特征与标签"],
                content="""
# 机器学习高频概念 · 讲解文档

## 一句话直觉
机器学习是在样本中寻找规律，再把规律用到新样本上。

## 四个最常考概念
1. **监督学习**：已知输入和正确答案，目标是学出映射关系。
2. **训练集 / 测试集**：前者用于学习，后者用于检查泛化能力。
3. **特征 / 标签**：特征是输入信息，标签是想预测的结果。
4. **过拟合**：模型把训练样本记得太死，导致新样本表现变差。

## 最小例子
房价预测里，面积、地段、楼层是特征，房价是标签。模型先看历史房源，再预测新房源价格。

## 学习后检查
- 说清监督学习和无监督学习的区别。
- 用自己的例子区分特征与标签。
- 解释为什么测试集不能参与训练。
                """,
            ),
            _template_resource(
                resource_type="mindmap",
                title="机器学习高频概念 · 思维导图",
                topic="机器学习基础概念",
                learning_purpose="review",
                estimated_minutes=7,
                quality_tags=["知识结构", "考前回顾"],
                knowledge_points=["任务类型", "数据划分", "模型评估", "常见风险"],
                content="""
# 机器学习高频概念 · 思维导图

```mermaid
mindmap
  root((机器学习高频概念))
    任务类型
      监督学习
      无监督学习
    数据
      特征
      标签
      训练集
      测试集
    评估
      准确率
      泛化能力
    风险
      过拟合
      欠拟合
```

## 复习建议
先从“任务类型 -> 数据 -> 评估 -> 风险”四条主线口述一遍，再补细节。
                """,
            ),
            _template_resource(
                resource_type="quiz",
                title="机器学习高频概念 · 快速小测",
                topic="机器学习基础概念",
                learning_purpose="practice",
                estimated_minutes=9,
                quality_tags=["课堂小测", "快问快答"],
                knowledge_points=["监督学习", "特征标签", "过拟合"],
                content="""
# 机器学习高频概念 · 快速小测

## 第 1 题（基础）
**题型：单选题**
**目标知识点：监督学习**
**题干：** 已知输入和正确答案，让模型学习映射关系，属于哪一类任务？
- **A.** 监督学习
- **B.** 无监督学习
- **C.** 强化学习
- **D.** 搜索算法
**答案：A**
**详细解析：** 监督学习依赖带标签样本，因此题干中的“已知正确答案”是关键。

## 第 2 题（基础）
**题型：单选题**
**目标知识点：特征与标签**
**题干：** 在房价预测中，“面积”通常属于什么？
- **A.** 标签
- **B.** 特征
- **C.** 损失函数
- **D.** 模型参数
**答案：B**
**详细解析：** 面积是输入信息，因此是特征；房价才是标签。

## 第 3 题（应用）
**题型：单选题**
**目标知识点：过拟合**
**题干：** 模型训练集表现很好，但测试集很差，最可能是什么问题？
- **A.** 欠拟合
- **B.** 过拟合
- **C.** 数据清洗完成
- **D.** 特征消失
**答案：B**
**详细解析：** 训练好、测试差说明模型泛化不足，典型表现就是过拟合。
                """,
            ),
            _template_resource(
                resource_type="review_card",
                title="机器学习高频概念 · 专属复习卡",
                topic="机器学习基础概念",
                learning_purpose="review",
                estimated_minutes=10,
                quality_tags=["复习卡", "高频考点"],
                knowledge_points=["监督学习", "训练集与测试集", "过拟合"],
                content="""
# 机器学习高频概念 · 专属复习卡

## 先记这四句
- 有标签学映射，通常是监督学习。
- 特征是输入，标签是要预测的结果。
- 训练集拿来学，测试集拿来验。
- 训练太好测试太差，优先怀疑过拟合。

## 快问快答
1. 为什么测试集不能参与训练？
2. 过拟合的表面现象是什么？
3. 房价预测里标签通常是什么？
                """,
            ),
        ],
    },
    "python-basic-syntax": {
        "info": {
            "id": "python-basic-syntax",
            "title": "Python 基础语法",
            "subtitle": "面向入门自学与课后补弱的轻量模板",
            "topic": "Python 基础语法",
            "tags": ["Python", "基础语法", "入门模板"],
            "resource_count": 4,
            "estimated_minutes": 34,
            "icon": "code",
            "color": "#13c2c2",
        },
        "resources": [
            _template_resource(
                resource_type="doc",
                title="Python 基础语法 · 讲解文档",
                topic="Python 基础语法",
                learning_purpose="explain",
                estimated_minutes=10,
                quality_tags=["入门", "讲练结合"],
                knowledge_points=["变量", "条件判断", "循环", "函数"],
                content="""
# Python 基础语法 · 讲解文档

## 入门四件套
1. **变量**：给数据起名字，方便后续复用。
2. **条件判断**：根据条件选择不同分支。
3. **循环**：重复执行同类操作。
4. **函数**：把一段逻辑封装起来，减少重复代码。

## 最小例子
```python
score = 88
if score >= 60:
    print("及格")
```

## 学习建议
先学会读代码，再开始自己写。每学一个语法，就自己改 1 个变量试运行。
                """,
            ),
            _template_resource(
                resource_type="code",
                title="Python 基础语法 · 可运行示例",
                topic="Python 基础语法",
                learning_purpose="project",
                estimated_minutes=9,
                quality_tags=["可运行", "代码练习"],
                knowledge_points=["输入输出", "条件", "循环", "函数"],
                content="""
# Python 基础语法 · 可运行示例

```python
def greet(name: str) -> None:
    print(f"你好，{name}")


for i in range(3):
    if i == 0:
        greet("Python 初学者")
    else:
        print("继续练习基础语法")
```

## 练习任务
- 把循环次数改成 5。
- 新增一个函数，返回两个数的和。
- 把判断条件换成字符串长度判断。
                """,
            ),
            _template_resource(
                resource_type="quiz",
                title="Python 基础语法 · 快速小测",
                topic="Python 基础语法",
                learning_purpose="practice",
                estimated_minutes=7,
                quality_tags=["语法检查", "课堂快测"],
                knowledge_points=["变量", "if", "for", "def"],
                content="""
# Python 基础语法 · 快速小测

## 第 1 题（基础）
**题型：单选题**
**目标知识点：变量**
**题干：** `name = "Alice"` 中，`name` 是什么？
- **A.** 关键字
- **B.** 变量名
- **C.** 函数名
- **D.** 注释
**答案：B**
**详细解析：** `name` 用来引用字符串 `"Alice"`，因此是变量名。

## 第 2 题（基础）
**题型：单选题**
**目标知识点：条件判断**
**题干：** Python 中条件分支常用哪个关键字？
- **A.** loop
- **B.** when
- **C.** if
- **D.** branch
**答案：C**
**详细解析：** `if` 是 Python 的条件判断关键字。
                """,
            ),
            _template_resource(
                resource_type="review_card",
                title="Python 基础语法 · 专属复习卡",
                topic="Python 基础语法",
                learning_purpose="review",
                estimated_minutes=8,
                quality_tags=["速记", "复习卡"],
                knowledge_points=["变量", "条件判断", "循环", "函数"],
                content="""
# Python 基础语法 · 专属复习卡

## 记忆主线
- 变量负责存数据。
- `if` 负责做判断。
- `for` 负责重复执行。
- `def` 负责封装函数。

## 快速自检
1. 自己写一个 `if` 语句判断年龄是否成年。
2. 用 `for` 打印 1 到 5。
3. 定义一个函数返回两个数的乘积。
                """,
            ),
        ],
    },
}


def list_resource_templates() -> list[ResourceTemplateInfo]:
    return [
        ResourceTemplateInfo(**deepcopy(item["info"]))
        for item in TEMPLATE_REGISTRY.values()
    ]


def _customize_template_resource(
    resource: dict,
    *,
    template_title: str,
    copy_title: str,
    topic_override: str,
) -> dict:
    payload = deepcopy(resource)
    if copy_title:
        original_title = str(payload.get("title") or "")
        if original_title.startswith(template_title):
            payload["title"] = original_title.replace(template_title, copy_title, 1)
        else:
            payload["title"] = f"{copy_title} · {original_title}"
    if topic_override:
        payload["topic"] = topic_override
        metadata = payload.setdefault("metadata", {})
        metadata["generated_context"] = {
            **(metadata.get("generated_context") or {}),
            "topic": topic_override,
        }
    return payload


async def create_resources_from_template(
    user_id: str,
    template_id: str,
    copy_title: str = "",
    topic_override: str = "",
) -> CreateFromTemplateResponse:
    template = TEMPLATE_REGISTRY.get(template_id)
    if not template:
        raise ValueError("模板不存在")

    resources: list[dict] = []
    for spec in template["resources"]:
        payload = _customize_template_resource(
            spec,
            template_title=template["info"]["title"],
            copy_title=copy_title.strip(),
            topic_override=topic_override.strip(),
        )
        payload["id"] = str(uuid.uuid4())
        # 保留原资源创建流，只新增 generation_mode=template 的模板实例化分支。
        resources.append(
            with_resource_metadata(
                payload,
                generation_context={
                    "topic": payload.get("topic", ""),
                    "requirements": f"模板中心：{copy_title.strip() or template['info']['title']}",
                    "mode": "template",
                },
            )
        )

    await save_resources(user_id, resources)
    await record_event(
        user_id,
        "template_create",
        meta={
            "template_id": template_id,
            "template_title": copy_title.strip() or template["info"]["title"],
            "resource_count": len(resources),
            "topic_override": topic_override.strip(),
        },
    )
    return CreateFromTemplateResponse(
        template_id=template_id,
        resources=resources,
        message=f"已从模板「{copy_title.strip() or template['info']['title']}」创建 {len(resources)} 项资源",
    )
