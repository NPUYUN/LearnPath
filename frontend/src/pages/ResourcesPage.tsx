import React, { useState } from 'react'
import {
  Card, Tabs, Tag, Button, Typography, Row, Col, Modal,
  Tooltip, Space, Input, Divider, Rate,
} from 'antd'
import {
  FileTextOutlined, ApartmentOutlined, FormOutlined,
  VideoCameraOutlined, CodeOutlined, StarOutlined,
  DownloadOutlined, EyeOutlined, PlusOutlined,
  SearchOutlined, StarFilled,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

const { Title, Text, Paragraph } = Typography

interface Resource {
  id: string; type: 'document' | 'mindmap' | 'quiz' | 'video' | 'code'
  title: string; topic: string; stage: string; starred: boolean
  preview: string; createdAt: string
}

const MOCK_RESOURCES: Resource[] = [
  {
    id: 'r1', type: 'document', title: '人工智能概述与发展历史', topic: 'AI 基础',
    stage: '阶段一', starred: true, createdAt: '2025-06-28',
    preview: `## 人工智能概述\n\n人工智能（Artificial Intelligence，AI）是计算机科学的一个分支，致力于**模拟、延伸和扩展人类智能**。\n\n### 发展历程\n\n| 时期 | 代表事件 |\n|------|----------|\n| 1950s | 图灵测试提出 |\n| 1980s | 专家系统繁荣 |\n| 2012 | AlexNet 深度学习革命 |\n| 2022 | ChatGPT 大语言模型时代 |\n\n### 三大核心要素\n\n1. **数据**：AI 的燃料\n2. **算法**：AI 的引擎\n3. **算力**：AI 的动力`,
  },
  {
    id: 'r2', type: 'mindmap', title: 'AI 知识全景思维导图', topic: 'AI 基础',
    stage: '阶段一', starred: false, createdAt: '2025-06-28',
    preview: `# AI 知识全景\n\n## 机器学习\n- 监督学习\n  - 分类\n  - 回归\n- 无监督学习\n  - 聚类\n  - 降维\n\n## 深度学习\n- CNN\n- RNN\n- Transformer\n\n## 应用领域\n- 计算机视觉\n- 自然语言处理\n- 语音识别`,
  },
  {
    id: 'r3', type: 'quiz', title: '机器学习基础概念测验（20题）', topic: '机器学习',
    stage: '阶段二', starred: true, createdAt: '2025-06-30',
    preview: `## 练习题库 · 机器学习基础\n\n**第1题（单选）**\n\n下列哪种算法属于无监督学习？\n\nA. 线性回归\nB. 逻辑回归\nC. K-Means 聚类 ✓\nD. SVM\n\n---\n\n**第2题（判断）**\n\n梯度下降法中，学习率越大，收敛越快且越稳定。\n\n答案：**错误** ❌（学习率过大会导致震荡，不收敛）\n\n---\n\n*共 20 题，预计完成时间 15 分钟*`,
  },
  {
    id: 'r4', type: 'video', title: '梯度下降算法可视化讲解脚本', topic: '机器学习',
    stage: '阶段二', starred: false, createdAt: '2025-07-01',
    preview: `## 视频讲解脚本\n\n**标题：** 梯度下降算法 — 3分钟直觉理解\n\n**时长：** 约 3 分钟\n\n---\n\n**[0:00-0:20] 开场引入**\n\n> "想象你站在一座山上，蒙着眼睛，想要找到山谷最低点。你会怎么做？每次都往脚下最陡的方向走一步。这就是梯度下降！"\n\n**[0:20-1:30] 数学直觉**\n\n展示损失函数碗形曲面，标注当前位置和负梯度方向箭头...\n\n**[1:30-2:30] 学习率影响**\n\n对比三种学习率：过大（震荡）、合适（收敛）、过小（极慢）`,
  },
  {
    id: 'r5', type: 'code', title: 'NumPy 数组操作完整案例', topic: 'Python 基础',
    stage: '阶段一', starred: false, createdAt: '2025-06-27',
    preview: `## NumPy 实操案例\n\n\`\`\`python\nimport numpy as np\n\n# 创建数组\na = np.array([1, 2, 3, 4, 5])\nb = np.random.randn(3, 3)  # 3x3 随机矩阵\n\n# 基础运算\nprint(a.mean())    # 均值: 3.0\nprint(a.std())     # 标准差\nprint(b @ b.T)     # 矩阵乘法\n\n# 广播机制\nc = a + 10  # [11, 12, 13, 14, 15]\n\n# 切片索引\nprint(a[1:4])  # [2, 3, 4]\nprint(b[:, 0]) # 第一列\n\`\`\`\n\n运行以上代码，观察输出结果，理解 NumPy 广播机制。`,
  },
  {
    id: 'r6', type: 'document', title: '反向传播算法详解', topic: '深度学习',
    stage: '阶段三', starred: true, createdAt: '2025-07-02',
    preview: `## 反向传播算法（Backpropagation）\n\n反向传播是深度学习中**最重要的训练算法**，通过链式法则计算梯度。\n\n### 核心思想\n\n$$\\frac{\\partial L}{\\partial w} = \\frac{\\partial L}{\\partial a} \\cdot \\frac{\\partial a}{\\partial z} \\cdot \\frac{\\partial z}{\\partial w}$$\n\n### 步骤\n\n1. **前向传播**：计算预测值和损失\n2. **反向传播**：用链式法则计算每层梯度\n3. **参数更新**：$w \\leftarrow w - \\eta \\nabla_w L$`,
  },
]

const TYPE_CONFIG: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  document: { icon: <FileTextOutlined />, color: '#1677ff', label: '讲解文档' },
  mindmap:  { icon: <ApartmentOutlined />, color: '#52c41a', label: '思维导图' },
  quiz:     { icon: <FormOutlined />,     color: '#fa8c16', label: '练习题库' },
  video:    { icon: <VideoCameraOutlined />, color: '#722ed1', label: '视频脚本' },
  code:     { icon: <CodeOutlined />,     color: '#13c2c2', label: '代码案例' },
}

const TABS = [
  { key: 'all', label: '全部' },
  { key: 'document', label: '📄 讲解文档' },
  { key: 'mindmap',  label: '🗺️ 思维导图' },
  { key: 'quiz',     label: '📝 练习题库' },
  { key: 'video',    label: '🎬 视频脚本' },
  { key: 'code',     label: '💻 代码案例' },
]

const ResourcesPage: React.FC = () => {
  const navigate = useNavigate()
  const [activeType, setActiveType] = useState('all')
  const [search, setSearch] = useState('')
  const [preview, setPreview] = useState<Resource | null>(null)
  const [starred, setStarred] = useState<Record<string, boolean>>(
    Object.fromEntries(MOCK_RESOURCES.map(r => [r.id, r.starred]))
  )

  const filtered = MOCK_RESOURCES.filter(r =>
    (activeType === 'all' || r.type === activeType) &&
    (r.title.includes(search) || r.topic.includes(search) || !search)
  )

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>学习资源库</Title>
          <Text type="secondary" style={{ fontSize: 13 }}>{MOCK_RESOURCES.length} 个资源 · 个性化生成</Text>
        </div>
        <Space>
          <Input
            prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
            placeholder="搜索资源..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: 200, borderRadius: 8 }}
            allowClear
          />
          <Button icon={<PlusOutlined />} type="primary" onClick={() => navigate('/chat')}>
            生成新资源
          </Button>
        </Space>
      </div>

      <Tabs activeKey={activeType} onChange={setActiveType} items={TABS} style={{ marginBottom: 16 }} />

      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#bfbfbf' }}>
          没有找到匹配的资源
        </div>
      ) : (
        <Row gutter={[16, 16]}>
          {filtered.map(r => {
            const cfg = TYPE_CONFIG[r.type]
            return (
              <Col key={r.id} xs={24} sm={12} lg={8}>
                <Card
                  hoverable
                  style={{ borderTop: `3px solid ${cfg.color}` }}
                  actions={[
                    <Tooltip title={starred[r.id] ? '取消收藏' : '收藏'} key="star">
                      <Button
                        type="text" size="small"
                        icon={starred[r.id] ? <StarFilled style={{ color: '#faad14' }} /> : <StarOutlined />}
                        onClick={() => setStarred(s => ({ ...s, [r.id]: !s[r.id] }))}
                      />
                    </Tooltip>,
                    <Tooltip title="预览" key="view">
                      <Button type="text" size="small" icon={<EyeOutlined />} onClick={() => setPreview(r)} />
                    </Tooltip>,
                    <Tooltip title="下载" key="dl">
                      <Button type="text" size="small" icon={<DownloadOutlined />} />
                    </Tooltip>,
                  ]}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 8,
                      background: `${cfg.color}15`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: cfg.color, fontSize: 18, flexShrink: 0,
                    }}>
                      {cfg.icon}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Text strong style={{ fontSize: 14, display: 'block', lineHeight: 1.4 }}>{r.title}</Text>
                      <div style={{ marginTop: 4 }}>
                        <Tag color={cfg.color.slice(1)} style={{ fontSize: 11 }}>{cfg.label}</Tag>
                        <Tag style={{ fontSize: 11 }}>{r.stage}</Tag>
                      </div>
                    </div>
                  </div>
                  <Text type="secondary" style={{ fontSize: 12 }}>话题：{r.topic} · {r.createdAt}</Text>
                </Card>
              </Col>
            )
          })}
        </Row>
      )}

      {/* Preview Modal */}
      <Modal
        open={!!preview}
        onCancel={() => setPreview(null)}
        footer={[
          <Button key="close" onClick={() => setPreview(null)}>关闭</Button>,
          <Button key="dl" icon={<DownloadOutlined />} type="primary">下载</Button>,
        ]}
        title={preview && (
          <span>
            <span style={{ color: TYPE_CONFIG[preview.type].color, marginRight: 8 }}>
              {TYPE_CONFIG[preview.type].icon}
            </span>
            {preview.title}
          </span>
        )}
        width={720}
      >
        {preview && (
          <div className="md-content" style={{ maxHeight: '60vh', overflowY: 'auto', padding: '0 4px' }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{preview.preview}</ReactMarkdown>
          </div>
        )}
      </Modal>
    </div>
  )
}

export default ResourcesPage
