import React, { useState } from 'react'
import {
  Card, Tag, Button, Typography, Progress, Row, Col,
  Timeline, Badge, Divider, Tooltip, Space,
} from 'antd'
import {
  CheckCircleOutlined, ClockCircleOutlined, LockOutlined,
  FileTextOutlined, ApartmentOutlined, FormOutlined,
  VideoCameraOutlined, CodeOutlined, PlayCircleOutlined,
  TrophyOutlined, FireOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'

const { Title, Text, Paragraph } = Typography

interface Resource { type: string; title: string }
interface Stage {
  id: string; title: string; subtitle: string
  duration: string; status: 'done' | 'active' | 'pending'
  progress: number; resources: Resource[]; desc: string
  objectives: string[]
}

const RESOURCE_ICONS: Record<string, React.ReactNode> = {
  document: <FileTextOutlined style={{ color: '#1677ff' }} />,
  mindmap:  <ApartmentOutlined style={{ color: '#52c41a' }} />,
  quiz:     <FormOutlined style={{ color: '#fa8c16' }} />,
  video:    <VideoCameraOutlined style={{ color: '#722ed1' }} />,
  code:     <CodeOutlined style={{ color: '#13c2c2' }} />,
}

const STAGES: Stage[] = [
  {
    id: 's1', title: '阶段一：AI 基础入门', subtitle: '打牢根基', duration: '第 1-2 周',
    status: 'done', progress: 100,
    desc: '建立对人工智能领域的整体认知，复习必要的数学基础，掌握 Python 科学计算工具链。',
    objectives: ['理解 AI 发展脉络', '掌握 NumPy/Pandas', '线性代数复习', '概率统计基础'],
    resources: [
      { type: 'document', title: 'AI 概述与发展历程' },
      { type: 'mindmap',  title: 'AI 知识全景图' },
      { type: 'code',     title: 'NumPy 实操练习' },
      { type: 'quiz',     title: '基础概念测验（15题）' },
    ],
  },
  {
    id: 's2', title: '阶段二：机器学习核心', subtitle: '夯实算法', duration: '第 3-5 周',
    status: 'active', progress: 45,
    desc: '系统学习经典机器学习算法，重点掌握监督学习与无监督学习，建立模型训练与评估的完整流程。',
    objectives: ['线性/逻辑回归', '决策树与随机森林', 'K-Means 聚类', '模型评估与调参'],
    resources: [
      { type: 'document', title: '监督学习算法详解' },
      { type: 'video',    title: '梯度下降可视化讲解' },
      { type: 'code',     title: 'Sklearn 实战项目' },
      { type: 'quiz',     title: '算法原理测验（20题）' },
      { type: 'mindmap',  title: 'ML 算法对比导图' },
    ],
  },
  {
    id: 's3', title: '阶段三：深度学习进阶', subtitle: '突破核心', duration: '第 6-8 周',
    status: 'pending', progress: 0,
    desc: '深入学习神经网络原理，掌握 CNN、RNN 等主流架构，使用 PyTorch 完成实际模型训练。',
    objectives: ['反向传播原理', 'CNN 图像识别', 'RNN/LSTM 序列模型', 'PyTorch 实战'],
    resources: [
      { type: 'document', title: '神经网络与反向传播' },
      { type: 'video',    title: 'CNN 架构演化讲解' },
      { type: 'code',     title: 'PyTorch MNIST 实战' },
      { type: 'mindmap',  title: '深度学习知识图谱' },
    ],
  },
  {
    id: 's4', title: '阶段四：综合项目实战', subtitle: '学以致用', duration: '第 9-12 周',
    status: 'pending', progress: 0,
    desc: '完成一个端到端的计算机视觉项目，包括数据收集、模型设计、训练调优和部署上线。',
    objectives: ['数据集构建', '模型设计与实验', '超参数调优', '模型部署'],
    resources: [
      { type: 'document', title: '项目开发完整指南' },
      { type: 'code',     title: '图像分类完整项目代码' },
      { type: 'quiz',     title: '项目评估检查清单' },
    ],
  },
]

const STATUS_CONFIG = {
  done:    { color: 'success', icon: <CheckCircleOutlined />, label: '已完成', tagColor: '#52c41a' },
  active:  { color: 'processing', icon: <PlayCircleOutlined />, label: '进行中', tagColor: '#1677ff' },
  pending: { color: 'default', icon: <LockOutlined />, label: '待解锁', tagColor: '#d9d9d9' },
} as const

const LearningPathPage: React.FC = () => {
  const navigate = useNavigate()
  const [expanded, setExpanded] = useState<string>('s2')

  const total = STAGES.reduce((s, st) => s + st.progress, 0)
  const overallProgress = Math.round(total / STAGES.length)

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>我的学习路径</Title>
          <Text type="secondary" style={{ fontSize: 13 }}>4 个阶段 · 12 周计划 · AI 深度学习方向</Text>
        </div>
        <Button icon={<FireOutlined />} type="primary" onClick={() => navigate('/chat')}>重新规划</Button>
      </div>

      {/* Overall progress */}
      <Card style={{ marginBottom: 20, background: 'linear-gradient(135deg, #e6f4ff 0%, #fff 100%)' }}>
        <Row align="middle" gutter={20}>
          <Col flex="auto">
            <Text strong style={{ fontSize: 15 }}>总体进度</Text>
            <Progress
              percent={overallProgress}
              strokeColor={{ '0%': '#1677ff', '100%': '#52c41a' }}
              style={{ marginTop: 8 }}
              format={p => <span style={{ fontWeight: 700, color: '#1677ff' }}>{p}%</span>}
            />
          </Col>
          <Col>
            <div style={{ textAlign: 'center' }}>
              <TrophyOutlined style={{ fontSize: 32, color: '#faad14' }} />
              <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>预计 12 周完成</div>
            </div>
          </Col>
        </Row>
        <Row gutter={20} style={{ marginTop: 12 }}>
          {STAGES.map(s => (
            <Col key={s.id} span={6} style={{ textAlign: 'center' }}>
              <Badge status={STATUS_CONFIG[s.status].color} text={
                <span style={{ fontSize: 12, color: s.status === 'active' ? '#1677ff' : '#888' }}>{s.title.replace('阶段', '')}</span>
              } />
            </Col>
          ))}
        </Row>
      </Card>

      {/* Stage cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {STAGES.map((stage, idx) => {
          const cfg = STATUS_CONFIG[stage.status]
          const isOpen = expanded === stage.id
          return (
            <Card
              key={stage.id}
              onClick={() => setExpanded(isOpen ? '' : stage.id)}
              hoverable
              style={{
                cursor: 'pointer',
                borderColor: stage.status === 'active' ? '#1677ff' : undefined,
                opacity: stage.status === 'pending' ? 0.75 : 1,
              }}
              bodyStyle={{ padding: 16 }}
            >
              <Row align="middle" gutter={12}>
                <Col>
                  <div style={{
                    width: 40, height: 40, borderRadius: '50%',
                    background: stage.status === 'done' ? '#f6ffed' : stage.status === 'active' ? '#e6f4ff' : '#f5f5f5',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 18, color: cfg.tagColor,
                  }}>
                    {cfg.icon}
                  </div>
                </Col>
                <Col flex="auto">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <Text strong style={{ fontSize: 15 }}>{stage.title}</Text>
                    <Tag color={stage.status === 'done' ? 'success' : stage.status === 'active' ? 'processing' : 'default'}>
                      {cfg.label}
                    </Tag>
                    <Text type="secondary" style={{ fontSize: 12 }}>{stage.duration}</Text>
                  </div>
                  {stage.status !== 'pending' && (
                    <Progress
                      percent={stage.progress}
                      strokeColor={cfg.tagColor}
                      size="small"
                      style={{ marginTop: 6, marginBottom: 0, maxWidth: 300 }}
                    />
                  )}
                </Col>
                <Col>
                  <Text type="secondary" style={{ fontSize: 12 }}>{stage.resources.length} 个资源</Text>
                </Col>
              </Row>

              {isOpen && (
                <>
                  <Divider style={{ margin: '12px 0' }} />
                  <Paragraph style={{ color: '#555', marginBottom: 12 }}>{stage.desc}</Paragraph>
                  <Row gutter={[12, 8]}>
                    <Col xs={24} sm={12}>
                      <Text strong style={{ fontSize: 13 }}>学习目标</Text>
                      <ul style={{ paddingLeft: 18, marginTop: 6, marginBottom: 0 }}>
                        {stage.objectives.map(o => (
                          <li key={o} style={{ fontSize: 13, color: '#555', marginBottom: 4 }}>{o}</li>
                        ))}
                      </ul>
                    </Col>
                    <Col xs={24} sm={12}>
                      <Text strong style={{ fontSize: 13 }}>配套资源</Text>
                      <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {stage.resources.map((r, i) => (
                          <Tooltip key={i} title={r.title}>
                            <Tag icon={RESOURCE_ICONS[r.type]} style={{ cursor: 'pointer', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {r.title}
                            </Tag>
                          </Tooltip>
                        ))}
                      </div>
                    </Col>
                  </Row>
                  {stage.status === 'active' && (
                    <div style={{ marginTop: 14 }}>
                      <Button type="primary" size="small" onClick={e => { e.stopPropagation(); navigate('/resources') }}>
                        查看本阶段资源
                      </Button>
                    </div>
                  )}
                </>
              )}
            </Card>
          )
        })}
      </div>
    </div>
  )
}

export default LearningPathPage
