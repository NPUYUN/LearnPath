import React, { useEffect, useRef } from 'react'
import { Card, Row, Col, Tag, Progress, Button, Divider, Typography, Tooltip } from 'antd'
import {
  UserOutlined,
  BookOutlined,
  ThunderboltOutlined,
  AimOutlined,
  ClockCircleOutlined,
  HeartOutlined,
  EditOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import * as echarts from 'echarts'

const { Title, Paragraph, Text } = Typography

// Mock profile data — replace with API call
const MOCK_PROFILE = {
  studentId: 'user_001',
  name: '学习者',
  updatedAt: '2025-07-01',
  summary: '具备一定编程基础，对人工智能领域有强烈学习意愿，偏好动手实践型学习方式。建议以项目驱动为主线，配合理论学习。',
  dimensions: [
    {
      key: 'knowledge',
      label: '知识基础',
      icon: <BookOutlined />,
      color: '#1677ff',
      score: 65,
      detail: '已掌握 Python 基础语法、线性代数基础；对机器学习概念有初步了解，深度学习部分需要加强。',
      tags: ['Python', '线性代数', '机器学习入门'],
    },
    {
      key: 'ability',
      label: '学习能力',
      icon: <ThunderboltOutlined />,
      color: '#52c41a',
      score: 78,
      detail: '学习速度较快，能够快速理解抽象概念，善于举一反三，逻辑思维强。',
      tags: ['快速理解', '举一反三', '逻辑思维'],
    },
    {
      key: 'goal',
      label: '学习目标',
      icon: <AimOutlined />,
      color: '#fa8c16',
      score: 90,
      detail: '目标明确：掌握深度学习并完成一个完整的 CV 项目，计划参加比赛。',
      tags: ['深度学习', 'CV方向', '竞赛目标'],
    },
    {
      key: 'style',
      label: '学习风格',
      icon: <HeartOutlined />,
      color: '#722ed1',
      score: 72,
      detail: '偏好项目驱动型学习，喜欢通过代码实践加深理解，阅读文档耐心略低。',
      tags: ['实践驱动', '代码优先', '视频学习'],
    },
    {
      key: 'time',
      label: '时间投入',
      icon: <ClockCircleOutlined />,
      color: '#13c2c2',
      score: 60,
      detail: '每天可投入 1.5-2 小时，周末较充裕可达 4-5 小时，节奏稳定性中等。',
      tags: ['2h/天', '周末充裕', '中等稳定性'],
    },
    {
      key: 'background',
      label: '学科背景',
      icon: <UserOutlined />,
      color: '#eb2f96',
      score: 55,
      detail: '计算机相关专业大三，已修完数据结构、概率论，微积分基础扎实。',
      tags: ['计算机专业', '大三', '数学基础良好'],
    },
  ],
}

const ProfilePage: React.FC = () => {
  const navigate = useNavigate()
  const chartRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!chartRef.current) return
    const chart = echarts.init(chartRef.current)
    const dims = MOCK_PROFILE.dimensions
    chart.setOption({
      radar: {
        indicator: dims.map(d => ({ name: d.label, max: 100 })),
        radius: '68%',
        axisName: { color: '#444', fontSize: 13, fontWeight: 500 },
        splitArea: { areaStyle: { color: ['#fafafa', '#f0f7ff'] } },
        axisLine: { lineStyle: { color: '#e0e0e0' } },
        splitLine: { lineStyle: { color: '#e0e0e0' } },
      },
      series: [{
        type: 'radar',
        data: [{
          value: dims.map(d => d.score),
          name: '学习画像',
          areaStyle: { color: 'rgba(22,119,255,0.15)' },
          lineStyle: { color: '#1677ff', width: 2 },
          itemStyle: { color: '#1677ff' },
        }],
      }],
      tooltip: { trigger: 'item' },
    })
    const ro = new ResizeObserver(() => chart.resize())
    ro.observe(chartRef.current)
    return () => { chart.dispose(); ro.disconnect() }
  }, [])

  return (
    <div style={{ padding: 24, maxWidth: 1060, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>我的学习画像</Title>
          <Text type="secondary" style={{ fontSize: 13 }}>最近更新：{MOCK_PROFILE.updatedAt} · 6 个维度分析</Text>
        </div>
        <Button icon={<EditOutlined />} onClick={() => navigate('/chat')}>更新画像</Button>
      </div>

      <Row gutter={[20, 20]}>
        {/* Radar chart */}
        <Col xs={24} lg={10}>
          <Card title="综合能力雷达图" style={{ height: 380 }}>
            <div ref={chartRef} style={{ height: 300 }} />
          </Card>
        </Col>

        {/* Summary */}
        <Col xs={24} lg={14}>
          <Card title="画像综合评价" style={{ height: 380, display: 'flex', flexDirection: 'column' }}>
            <Paragraph style={{ color: '#444', lineHeight: 1.8, fontSize: 14 }}>
              {MOCK_PROFILE.summary}
            </Paragraph>
            <Divider style={{ margin: '12px 0' }} />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {MOCK_PROFILE.dimensions.map(d => (
                <Tag key={d.key} color={d.color.replace('#', '')} style={{ borderRadius: 20, padding: '2px 12px' }}>
                  {d.label}：{d.score}分
                </Tag>
              ))}
            </div>
            <div style={{ marginTop: 'auto', paddingTop: 16 }}>
              <Button type="primary" onClick={() => navigate('/path')} style={{ marginRight: 10 }}>
                查看学习路径
              </Button>
              <Button onClick={() => navigate('/chat')}>继续对话优化</Button>
            </div>
          </Card>
        </Col>

        {/* Dimension detail cards */}
        {MOCK_PROFILE.dimensions.map(d => (
          <Col xs={24} sm={12} lg={8} key={d.key}>
            <Card
              size="small"
              title={
                <span style={{ color: d.color }}>
                  {d.icon} &nbsp;{d.label}
                </span>
              }
              extra={
                <Tooltip title={d.detail}>
                  <InfoCircleOutlined style={{ color: '#bfbfbf' }} />
                </Tooltip>
              }
            >
              <Progress
                percent={d.score}
                strokeColor={d.color}
                trailColor="#f0f0f0"
                format={p => <span style={{ color: d.color, fontWeight: 600 }}>{p}分</span>}
                style={{ marginBottom: 10 }}
              />
              <Paragraph style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>{d.detail}</Paragraph>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {d.tags.map(t => <Tag key={t} style={{ fontSize: 11 }}>{t}</Tag>)}
              </div>
            </Card>
          </Col>
        ))}
      </Row>
    </div>
  )
}

export default ProfilePage
