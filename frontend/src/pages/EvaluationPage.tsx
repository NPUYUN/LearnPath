import React, { useEffect, useRef } from 'react'
import { Card, Row, Col, Statistic, Progress, Tag, Typography, Divider, Button, Timeline } from 'antd'
import {
  TrophyOutlined, FireOutlined, ClockCircleOutlined,
  CheckCircleOutlined, BookOutlined, RiseOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import * as echarts from 'echarts'

const { Title, Text, Paragraph } = Typography

const STATS = [
  { title: '累计学习时长', value: '32h', icon: <ClockCircleOutlined style={{ color: '#1677ff' }} />, color: '#e6f4ff' },
  { title: '已完成资源', value: 18, suffix: '个', icon: <BookOutlined style={{ color: '#52c41a' }} />, color: '#f6ffed' },
  { title: '完成率', value: 72, suffix: '%', icon: <CheckCircleOutlined style={{ color: '#fa8c16' }} />, color: '#fff7e6' },
  { title: '学习连续天数', value: 14, suffix: '天', icon: <FireOutlined style={{ color: '#f5222d' }} />, color: '#fff1f0' },
]

const DIMENSIONS = [
  { name: '知识掌握度', before: 45, after: 72, color: '#1677ff' },
  { name: '实践能力', before: 38, after: 65, color: '#52c41a' },
  { name: '理解深度', before: 50, after: 70, color: '#fa8c16' },
  { name: '学习效率', before: 55, after: 78, color: '#722ed1' },
  { name: '应用迁移', before: 30, after: 58, color: '#13c2c2' },
]

const RECENT_EVENTS = [
  { color: 'green',  label: '完成', content: '完成「监督学习算法详解」文档阅读', date: '今天 10:20' },
  { color: 'blue',   label: '生成', content: '生成「梯度下降算法」练习题库（20题）', date: '今天 09:30' },
  { color: 'green',  label: '完成', content: '完成「NumPy 实操练习」代码案例并提交', date: '昨天 20:15' },
  { color: 'orange', label: '测验', content: '完成「机器学习基础概念」测验 — 得分 85/100', date: '昨天 19:00' },
  { color: 'blue',   label: '生成', content: '生成「AI 知识全景」思维导图', date: '06-30 14:22' },
]

const EvaluationPage: React.FC = () => {
  const navigate = useNavigate()
  const radarRef = useRef<HTMLDivElement>(null)
  const barRef   = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!radarRef.current) return
    const chart = echarts.init(radarRef.current)
    chart.setOption({
      legend: { data: ['学习前', '学习后'], bottom: 0 },
      radar: {
        indicator: DIMENSIONS.map(d => ({ name: d.name, max: 100 })),
        radius: '60%',
        axisName: { fontSize: 12 },
        splitArea: { areaStyle: { color: ['#fafafa', '#f0f7ff'] } },
        axisLine:  { lineStyle: { color: '#e0e0e0' } },
        splitLine: { lineStyle: { color: '#e0e0e0' } },
      },
      series: [
        {
          type: 'radar', name: '对比',
          data: [
            { value: DIMENSIONS.map(d => d.before), name: '学习前', areaStyle: { color: 'rgba(100,100,100,0.1)' }, lineStyle: { color: '#aaa', type: 'dashed' }, itemStyle: { color: '#aaa' } },
            { value: DIMENSIONS.map(d => d.after),  name: '学习后', areaStyle: { color: 'rgba(22,119,255,0.15)' }, lineStyle: { color: '#1677ff' }, itemStyle: { color: '#1677ff' } },
          ],
        },
      ],
    })
    const ro = new ResizeObserver(() => chart.resize())
    ro.observe(radarRef.current)
    return () => { chart.dispose(); ro.disconnect() }
  }, [])

  useEffect(() => {
    if (!barRef.current) return
    const chart = echarts.init(barRef.current)
    chart.setOption({
      grid: { top: 20, bottom: 40, left: 50, right: 20 },
      xAxis: { type: 'category', data: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'] },
      yAxis: { type: 'value', name: '分钟', nameTextStyle: { fontSize: 11 } },
      series: [{
        type: 'bar',
        data: [65, 90, 40, 110, 80, 150, 120],
        itemStyle: { color: '#1677ff', borderRadius: [4, 4, 0, 0] },
        label: { show: true, position: 'top', fontSize: 11 },
      }],
      tooltip: { trigger: 'axis' },
    })
    const ro = new ResizeObserver(() => chart.resize())
    ro.observe(barRef.current)
    return () => { chart.dispose(); ro.disconnect() }
  }, [])

  return (
    <div style={{ padding: 24, maxWidth: 1060, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>学习效果评估</Title>
          <Text type="secondary" style={{ fontSize: 13 }}>AI 生成评估报告 · 数据截至 2025-07-01</Text>
        </div>
        <Button icon={<RiseOutlined />} onClick={() => navigate('/chat')}>更新评估</Button>
      </div>

      {/* Stats row */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        {STATS.map(s => (
          <Col xs={12} sm={6} key={s.title}>
            <Card style={{ background: s.color, borderColor: 'transparent' }} bodyStyle={{ padding: '16px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ fontSize: 24 }}>{s.icon}</div>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.2 }}>
                    {s.value}{s.suffix}
                  </div>
                  <div style={{ fontSize: 12, color: '#888' }}>{s.title}</div>
                </div>
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      <Row gutter={[16, 16]}>
        {/* Radar */}
        <Col xs={24} lg={12}>
          <Card title="能力成长对比雷达图">
            <div ref={radarRef} style={{ height: 280 }} />
          </Card>
        </Col>

        {/* Weekly bar */}
        <Col xs={24} lg={12}>
          <Card title="本周每日学习时长（分钟）">
            <div ref={barRef} style={{ height: 280 }} />
          </Card>
        </Col>

        {/* AI report */}
        <Col xs={24} lg={14}>
          <Card title="AI 学习报告" extra={<Tag color="blue">自动生成</Tag>}>
            <Paragraph style={{ color: '#444', lineHeight: 1.9 }}>
              根据近两周的学习数据，你的整体表现<Text strong style={{ color: '#52c41a' }}>优秀</Text>。知识掌握度从 45 分提升至 72 分，进步显著。
            </Paragraph>
            <Paragraph style={{ color: '#444', lineHeight: 1.9 }}>
              <Text strong>优势：</Text>学习连续性好（连续14天打卡），实践能力提升幅度最大（+27分），周末学习时长充足。
            </Paragraph>
            <Paragraph style={{ color: '#444', lineHeight: 1.9 }}>
              <Text strong>待提升：</Text>应用迁移能力尚显不足（58分），建议增加跨领域综合练习；周三学习时长偏短，可适当补充。
            </Paragraph>
            <Divider style={{ margin: '12px 0' }} />
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {DIMENSIONS.map(d => (
                <div key={d.name} style={{ minWidth: 160 }}>
                  <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>
                    {d.name} <Text strong style={{ color: d.color }}>+{d.after - d.before}分</Text>
                  </div>
                  <Progress
                    percent={d.after} success={{ percent: d.before, strokeColor: '#d9d9d9' }}
                    strokeColor={d.color} size="small" showInfo={false}
                  />
                </div>
              ))}
            </div>
          </Card>
        </Col>

        {/* Activity timeline */}
        <Col xs={24} lg={10}>
          <Card title="近期学习记录">
            <Timeline
              items={RECENT_EVENTS.map(e => ({
                color: e.color,
                children: (
                  <div>
                    <Tag color={e.color} style={{ fontSize: 11 }}>{e.label}</Tag>
                    <div style={{ fontSize: 13, color: '#444', marginTop: 4 }}>{e.content}</div>
                    <div style={{ fontSize: 11, color: '#bfbfbf', marginTop: 2 }}>{e.date}</div>
                  </div>
                ),
              }))}
            />
          </Card>
        </Col>
      </Row>
    </div>
  )
}

export default EvaluationPage
