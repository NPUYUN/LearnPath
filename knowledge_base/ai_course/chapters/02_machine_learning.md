---
title: 机器学习基础
chapter: 2
difficulty: beginner
keywords: [机器学习, 监督学习, 梯度下降, 线性回归]
prerequisites: [人工智能概述]
estimated_time: 120min
---

# 第二章：机器学习基础

## 2.1 监督学习

监督学习是最常见的机器学习范式。给定带标签的训练数据 $(x_i, y_i)$，学习一个函数 $f: X \rightarrow Y$。

### 线性回归示例

```python
import numpy as np
import matplotlib.pyplot as plt

# 生成模拟数据
np.random.seed(42)
X = 2 * np.random.rand(100, 1)
y = 4 + 3 * X + np.random.randn(100, 1)

# 正规方程求解
X_b = np.c_[np.ones((100, 1)), X]  # 添加偏置项
theta_best = np.linalg.inv(X_b.T @ X_b) @ X_b.T @ y
print(f"theta: {theta_best}")  # 接近 [4, 3]
```

## 2.2 梯度下降

梯度下降是机器学习中最核心的优化算法。

**更新规则：**
$$\theta = \theta - \alpha \cdot \nabla_\theta J(\theta)$$

其中 $\alpha$ 是学习率，$J(\theta)$ 是损失函数。

### 常见变体

| 类型 | 特点 | 适用场景 |
|------|------|----------|
| 批量梯度下降 | 使用全部数据，稳定但慢 | 小数据集 |
| 随机梯度下降（SGD） | 每次用一个样本，快但震荡 | 大数据集 |
| 小批量梯度下降 | 折中方案，最常用 | 通用 |

## 2.3 模型评估

- **均方误差（MSE）**：$\text{MSE} = \frac{1}{n}\sum_{i=1}^n(y_i - \hat{y}_i)^2$
- **准确率（Accuracy）**：分类任务的基本指标
- **交叉验证（Cross-Validation）**：防止过拟合的评估方法

## 2.4 过拟合与正则化

过拟合：模型在训练集表现好，测试集表现差

解决方案：
1. **L1正则化（Lasso）**：增加 $\lambda \sum |\theta_i|$ 惩罚项
2. **L2正则化（Ridge）**：增加 $\lambda \sum \theta_i^2$ 惩罚项
3. **Dropout**：神经网络中随机丢弃神经元
4. **早停（Early Stopping）**：验证集性能不再提升时停止训练

## 2.5 思考题

1. 如何判断模型是过拟合还是欠拟合？如何分别解决？
2. 学习率设置过大或过小会有什么影响？
3. 实现一个简单的 k-折交叉验证函数。
