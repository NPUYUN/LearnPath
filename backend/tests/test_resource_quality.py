from __future__ import annotations

import unittest
from unittest.mock import AsyncMock, patch

from app.agents.nodes.reviewer_agent import assess_resource, review_resources
from app.core.prompts import resource_generation_system
from app.services.quiz_validation_service import validate_quiz_content
from app.services.quiz_semantic_review_service import parse_semantic_review
from app.services.resource_content_service import formula_quality_issues, normalize_latex_markdown


def _resource(resource_type: str, content: str, *, resource_id: str = "new") -> dict:
    return {
        "id": resource_id,
        "type": resource_type,
        "title": "梯度下降专项资源",
        "topic": "梯度下降",
        "content": content,
        "sources": ["课程讲义第 3 章"],
    }


def _quiz_content() -> str:
    rows = [
        "# 梯度下降分层题集",
        "## 资源导航",
        "- 对应知识点：学习率、梯度方向",
        "- 学习用途：课堂小测与复习",
        "## 资源摘要",
        "本题集通过基础理解、应用判断与易错辨析三个层次，检查学生能否判断梯度方向、分析学习率影响，并识别震荡、停滞等常见误区。每题均提供答案、详细解析与选项诊断，可直接用于课堂小测和课后复盘。",
    ]
    levels = ["基础", "基础", "基础", "应用", "应用", "应用", "易错", "易错"]
    for index, level in enumerate(levels, 1):
        rows.extend(
            [
                f"## 第 {index} 题（{level}）",
                "**题型：单选题**",
                "**目标知识点：学习率与参数更新**",
                f"**题干：** 给定损失下降情境 {index}，哪一种参数更新判断正确？",
                "- **A.** 始终增大学习率",
                "- **B.** 沿负梯度方向更新",
                "- **C.** 忽略梯度直接归零",
                "- **D.** 每步反转损失函数",
                "**答案：B**",
                "**详细解析：** 负梯度给出当前局部最陡下降方向；学习率只控制步长，不能替代方向判断。",
                "**选项诊断：**",
                "- A：误区是把更大步长等同于更快收敛，忽略震荡风险。",
                "- B：说明能够区分更新方向与更新步长。",
                "- C：误区是忽略梯度承载的局部方向信息。",
                "- D：误区是混淆参数更新与目标函数定义。",
                "**误区诊断：** 本题诊断是否混淆学习率和梯度方向。",
            ]
        )
    rows.extend(
        [
            "## 学习后检查",
            "把错题按方向判断、步长选择和停止条件分类。",
            "## 下一步建议",
            "进入带数值计算的变式训练。",
            "## 预期学习结果",
            "能在新情境中判断合理的参数更新。",
        ]
    )
    return "\n\n".join(rows)


class ResourceQualityTests(unittest.IsolatedAsyncioTestCase):
    def test_escaped_latex_is_normalized_for_markdown_renderer(self) -> None:
        raw = r"导数为 \\( \\frac{dy}{dx} \\)，指数为 ( \\mathrm{e}^{-x} )。\n\\[ \\sum_{i=1}^{n} i \\]"
        normalized = normalize_latex_markdown(raw)
        self.assertIn(r"$\frac{dy}{dx}$", normalized)
        self.assertIn(r"$\mathrm{e}^{-x}$", normalized)
        self.assertIn(r"$$\sum_{i=1}^{n} i$$", normalized)
        self.assertEqual(formula_quality_issues(normalized), [])

    def test_quiz_validator_rejects_answer_explanation_conflict(self) -> None:
        content = _quiz_content().replace(
            "**详细解析：** 负梯度给出当前局部最陡下降方向；",
            "**详细解析：** 正确答案是 D，但负梯度给出当前局部最陡下降方向；",
            1,
        )
        validation = validate_quiz_content(content)
        self.assertFalse(validation["passed"])
        self.assertEqual(validation["invalid_numbers"], [1])
        self.assertTrue(any("解析明确支持 D" in issue for issue in validation["invalid_questions"][0]["issues"]))

    def test_quiz_validator_accepts_plain_letter_options(self) -> None:
        content = """## 第 1 题（基础）
题干：以下哪项正确？
A. 干扰项一
B. 正确选项
C. 干扰项二
D. 干扰项三

**答案：B**
**解析：** B 符合题干条件，其余选项分别混淆了适用条件。
"""
        validation = validate_quiz_content(content)
        self.assertEqual(validation["question_count"], 1)
        self.assertEqual(validation["invalid_numbers"], [])

    def test_semantic_review_rejects_self_consistent_wrong_answer(self) -> None:
        content = """## 第 1 题（基础）
以下哪个方程是伯努利方程？
A. 一阶线性方程
B. Riccati 方程
C. 仍可化为一阶线性方程
D. 含指数项的非线性方程

**答案：D**
**解析：** D 是非线性方程，所以它是伯努利方程。
"""
        raw = """{"questions":[{"number":1,"verdict":"no_unique_answer","correct_answer":"NONE","reason":"四个选项都不符合伯努利方程标准形式","confidence":0.99}]}"""
        result = parse_semantic_review(raw, content)
        self.assertFalse(result["passed"])
        self.assertEqual(result["invalid_numbers"], [1])

    def test_semantic_truth_table_rejects_multiple_correct_options(self) -> None:
        content = """## 第 1 题（应用）
以下哪个方程可用变量分离法求解？
A. 方程一
B. 方程二
C. 方程三
D. 方程四

**答案：C**
**解析：** C 可以分离变量。
"""
        raw = """{"questions":[{"number":1,"verdict":"pass","correct_answer":"C","option_truth":{"A":true,"B":true,"C":true,"D":false},"reason":"C 可分离","confidence":0.99}]}"""
        result = parse_semantic_review(raw, content)
        self.assertFalse(result["passed"])
        self.assertEqual(result["items"][0]["verdict"], "no_unique_answer")

    async def test_semantic_failure_forces_quiz_to_draft(self) -> None:
        audit = {
            "passed": False,
            "reviewed_count": 8,
            "question_count": 8,
            "invalid_numbers": [5],
            "invalid_questions": [
                {
                    "number": 5,
                    "level": "基础",
                    "issues": ["语义正确性未通过：给定答案并非正确选项"],
                    "raw": "## 第 5 题（基础）\n题目内容",
                }
            ],
            "items": [],
            "error": "",
        }
        with patch(
            "app.agents.nodes.reviewer_agent.review_quiz_semantics",
            new=AsyncMock(return_value=audit),
        ):
            reviewed = await review_resources(
                [_resource("quiz", _quiz_content())],
                skip_llm=False,
                allow_rewrite=False,
            )
        self.assertEqual(reviewed[0]["status"], "draft")
        self.assertFalse(reviewed[0]["metadata"]["quiz_semantic_verified"])
        self.assertEqual(reviewed[0]["metadata"]["quiz_invalid_questions"], [5])

    async def test_conflicting_quiz_is_saved_as_draft_without_repair_model(self) -> None:
        content = _quiz_content().replace(
            "**详细解析：** 负梯度给出当前局部最陡下降方向；",
            "**详细解析：** 正确答案是 D，但负梯度给出当前局部最陡下降方向；",
            1,
        )
        reviewed = await review_resources([_resource("quiz", content)], skip_llm=True)
        self.assertEqual(reviewed[0]["status"], "draft")
        self.assertEqual(reviewed[0]["metadata"]["quiz_invalid_questions"], [1])

    def test_prompt_contains_quiz_hard_constraints(self) -> None:
        prompt = resource_generation_system("quiz")
        self.assertIn("至少 8 题", prompt)
        self.assertIn("错误选项", prompt)
        self.assertIn("禁止 JSON", prompt)

    def test_high_quality_quiz_passes_with_eight_diagnosed_questions(self) -> None:
        result = assess_resource(_resource("quiz", _quiz_content()))
        self.assertGreaterEqual(result["score"], 7)
        self.assertIn("有小测", result["quality_tags"])
        self.assertIn("有详解", result["quality_tags"])

    def test_high_quality_doc_contains_worked_example_and_self_check(self) -> None:
        content = """# 梯度下降典型例题讲义

## 资源导航
- 对应知识点：梯度方向、学习率
- 学习用途：课堂讲解与课后复习
- 适合水平：基础到应用
- 前置知识：导数
- 适用场景：课堂例题、课后复盘

## 资源摘要
本讲义用一个可手算的二次函数例题连接导数、负梯度方向和学习率，逐步展示一次参数更新，并解释步长过大造成震荡的原因。学完后可独立完成同类更新计算，并通过自检题确认是否真正理解方向与步长的区别。

## 知识点目标
理解负梯度决定方向、学习率决定步长。

## 前置知识
会计算一元函数导数并代入数值。

## 核心概念解释
梯度指向函数增长最快方向，因此最小化时沿负梯度更新；学习率只缩放本次移动距离。

## 典型例题
问题：设 $f(x)=x^2$，初值 $x_0=4$，学习率 $0.1$，求一次更新后的参数。

### 解题思路
先求导得到当前位置梯度，再代入更新公式。

### 解题步骤
1. 求导：$f'(x)=2x$。
2. 代入 $x_0=4$，梯度为 $8$。
3. 更新 $x_1=4-0.1\times 8=3.2$。

### 最终答案
$x_1=3.2$，函数值由 $16$ 降到 $10.24$。

## 常见误区与易错点
- 把梯度方向当成下降方向；实际上最小化要取负梯度。
- 认为学习率越大越快；过大会跨过低点并震荡。

## 自检问题
若学习率改为 $0.5$，一次更新后的 $x_1$ 是多少？

### 参考答案与解析
答案是 $0$。解析：$4-0.5\times8=0$，本例恰好一步到达最小点，但不能据此断言所有问题都适合该学习率。

## 学习后检查
遮住答案，独立复现三步计算并解释每一步的依据。

## 下一步建议
完成二维函数的梯度更新练习。

## 预期学习结果
能够计算一次梯度更新，并解释方向和步长各自的作用。
"""
        result = assess_resource(_resource("doc", content))
        self.assertGreaterEqual(result["score"], 7)
        self.assertIn("有例题", result["quality_tags"])
        self.assertIn("有详解", result["quality_tags"])

    def test_high_quality_code_is_runnable_and_documented(self) -> None:
        content = '''# 梯度下降完整代码案例

## 资源导航
- 对应知识点：梯度计算、参数更新
- 学习用途：实践课堂与项目练习
- 适合水平：基础
- 前置知识：Python 函数
- 适用场景：课堂演示、课后实操

## 资源摘要
本案例用纯 Python 实现一元二次函数的梯度下降，展示参数、梯度、学习率和损失值在每轮中的变化。代码无需第三方依赖，可直接运行并核对样例输出；完成后还可修改学习率，观察收敛速度与震荡风险。

## 运行环境
Python 3.11，无第三方依赖。

## 实践目标与输入输出
输入为初始参数、学习率和迭代次数，输出每轮参数与损失。

## 完整代码
```python
def loss(x: float) -> float:
    """计算目标函数。"""
    return x * x


def gradient(x: float) -> float:
    """计算当前位置的梯度。"""
    return 2.0 * x


def main() -> None:
    # 初始参数与学习率决定起点和每次更新的步长
    parameter = 4.0
    learning_rate = 0.1
    # 连续执行三次更新，并打印可核对的结果
    for step in range(3):
        parameter -= learning_rate * gradient(parameter)
        print(f"step={step + 1}, x={parameter:.3f}, loss={loss(parameter):.3f}")


if __name__ == "__main__":
    main()
```

## 核心函数与关键代码解释
`gradient` 返回 $2x$；主循环先计算梯度，再用学习率缩放更新量。`parameter` 是当前变量，`learning_rate` 是步长系数。

## 运行步骤
1. 保存为 `gradient_demo.py`。
2. 执行 `python gradient_demo.py`。

## 样例输入
程序内置 `parameter=4.0`、`learning_rate=0.1`、迭代 3 次。

## 样例输出
```text
step=1, x=3.200, loss=10.240
step=2, x=2.560, loss=6.554
step=3, x=2.048, loss=4.194
```

## 核心逻辑
每轮沿负梯度移动；学习率不改变方向，只控制移动距离。

## 常见错误及解决方法
- 错把 `+=` 当成下降更新：改为 `-=`。
- 学习率过大导致震荡：减小 `learning_rate` 后重试。

## 扩展任务与学习后检查
把学习率改为 1.1，记录损失变化并解释为什么不再收敛。

## 下一步建议
把标量参数扩展成二维列表，并分别计算两个方向的梯度。

## 预期学习结果
能够运行、修改并解释一份完整的梯度下降程序。
'''
        result = assess_resource(_resource("code", content))
        self.assertGreaterEqual(result["score"], 7)
        self.assertIn("有代码", result["quality_tags"])

    async def test_low_quality_doc_is_draft_without_llm(self) -> None:
        low = _resource("doc", "# 梯度下降\n\n梯度下降是一种优化方法，用于降低损失函数。")
        reviewed = await review_resources([low], skip_llm=True)
        self.assertEqual(reviewed[0]["status"], "draft")
        self.assertLess(reviewed[0]["metadata"]["quality_score"], 7)
        self.assertTrue(reviewed[0]["needs_rewrite"])

    async def test_duplicate_resource_is_not_published(self) -> None:
        content = _quiz_content()
        existing = _resource("quiz", content, resource_id="old")
        existing["status"] = "published"
        reviewed = await review_resources(
            [_resource("quiz", content, resource_id="new")],
            skip_llm=True,
            existing_resources=[existing],
        )
        self.assertEqual(reviewed[0]["status"], "draft")
        self.assertEqual(reviewed[0]["metadata"]["duplicate_of"], "old")

    def test_incomplete_code_fails_required_checks(self) -> None:
        content = (
            "# 代码案例\n\n## 资源导航\n- 对应知识点：梯度下降\n\n"
            "## 资源摘要\n这是一个只有片段的代码资源，虽然文字看起来完整，但没有运行入口、中文注释、样例输出和错误说明，因此不能作为正式实践材料提供给学生使用。\n\n"
            "```python\nvalue = value - rate * gradient\n```\n\n## 说明\n更新参数。"
        )
        result = assess_resource(_resource("code", content))
        self.assertLess(result["score"], 7)
        self.assertTrue(any("完整可运行代码" in issue for issue in result["issues"]))


if __name__ == "__main__":
    unittest.main()
