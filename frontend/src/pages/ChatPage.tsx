import React, { useState, useRef, useEffect } from 'react'
import { Input, Button, Avatar, Tag, Tooltip, Space } from 'antd'
import {
  SendOutlined,
  UserOutlined,
  RobotOutlined,
  FileTextOutlined,
  ApartmentOutlined,
  FormOutlined,
  VideoCameraOutlined,
  CodeOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  resources?: ResourcePreview[]
  timestamp: Date
  isTyping?: boolean
}

interface ResourcePreview {
  type: 'document' | 'mindmap' | 'quiz' | 'video' | 'code'
  title: string
}

const RESOURCE_CONFIG: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
  document: { color: '#1677ff', icon: <FileTextOutlined />, label: '讲解文档' },
  mindmap:  { color: '#52c41a', icon: <ApartmentOutlined />, label: '思维导图' },
  quiz:     { color: '#fa8c16', icon: <FormOutlined />,     label: '练习题库' },
  video:    { color: '#722ed1', icon: <VideoCameraOutlined />, label: '视频脚本' },
  code:     { color: '#13c2c2', icon: <CodeOutlined />,     label: '代码案例' },
}

const QUICK_ACTIONS = [
  '帮我构建学习画像',
  '生成神经网络学习资源',
  '制定一个月学习计划',
  '解释反向传播算法',
]

// Simulated responses with mock resources
const MOCK_RESPONSES: Record<string, { content: string; resources?: ResourcePreview[] }> = {
  default: {
    content: `好的，我来帮你处理这个请求。\n\n基于你的学习画像分析，我为你生成了以下个性化学习资源：`,
    resources: [
      { type: 'document', title: '核心概念讲解文档' },
      { type: 'mindmap',  title: '知识点思维导图' },
      { type: 'quiz',     title: '个性化练习题库（10题）' },
      { type: 'video',    title: '3分钟教学视频脚本' },
      { type: 'code',     title: 'Python 代码实操案例' },
    ],
  },
  profile: {
    content: `好的，让我们先来了解一下你的学习情况 📊\n\n**第一步：基础信息**\n\n你目前是什么专业的学生？对人工智能/计算机方向了解多少？（可以用0-10分来评估，0分是完全没接触，10分是非常熟悉）`,
  },
  plan: {
    content: `根据你的学习画像，我为你制定了以下 **4周学习计划** 📅\n\n**阶段一：基础入门（第1周）**\n- 人工智能概述与发展历史\n- Python 基础语法回顾\n- NumPy / Pandas 数据处理\n\n**阶段二：机器学习核心（第2周）**\n- 监督学习：线性回归、逻辑回归\n- 无监督学习：K-Means 聚类\n- 模型评估与交叉验证\n\n**阶段三：深度学习（第3周）**\n- 神经网络基础与反向传播\n- CNN 图像识别\n- RNN / LSTM 序列模型\n\n**阶段四：实战项目（第4周）**\n- 完整项目实战\n- 模型部署上线\n\n> 每天预计学习 **2小时**，每周末安排综合练习。要开始执行这个计划吗？`,
  },
}

const ChatPage: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '0',
      role: 'assistant',
      content: `你好！我是 **学径 LearnPath 学习助手** 🎓\n\n我可以帮你：\n- 📊 **构建个人学习画像** — 通过对话了解你的学习情况\n- 📚 **生成个性化学习资源** — 文档、思维导图、题库、视频脚本、代码案例\n- 🗺️ **规划学习路径** — 科学分阶段的个性化学习计划\n- 🤔 **解答学习疑问** — 随时提问，RAG 知识库支撑\n\n请告诉我你想学习什么，或者点击下方快捷操作开始 👇`,
      timestamp: new Date(),
    },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = async (text?: string) => {
    const content = (text ?? input).trim()
    if (!content || loading) return
    setInput('')

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content, timestamp: new Date() }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)

    // Add typing indicator
    const typingId = 'typing'
    setMessages(prev => [...prev, { id: typingId, role: 'assistant', content: '', isTyping: true, timestamp: new Date() }])

    await new Promise(r => setTimeout(r, 1200))

    // Pick mock response
    let resp = MOCK_RESPONSES.default
    if (content.includes('画像') || content.includes('了解')) resp = MOCK_RESPONSES.profile
    else if (content.includes('计划') || content.includes('路径')) resp = MOCK_RESPONSES.plan

    setMessages(prev => prev
      .filter(m => m.id !== typingId)
      .concat({
        id: Date.now().toString(),
        role: 'assistant',
        content: resp.content,
        resources: resp.resources,
        timestamp: new Date(),
      })
    )
    setLoading(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* Header */}
      <div style={{
        padding: '14px 24px',
        background: '#fff',
        borderBottom: '1px solid #f0f0f0',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        flexShrink: 0,
      }}>
        <RobotOutlined style={{ fontSize: 20, color: '#1677ff' }} />
        <div>
          <div style={{ fontWeight: 600, fontSize: 15 }}>智能学习助手</div>
          <div style={{ fontSize: 12, color: '#52c41a' }}>● 在线 · 由讯飞星火 4.0 Ultra 驱动</div>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <Tooltip title="清空对话">
            <Button icon={<ReloadOutlined />} size="small" onClick={() =>
              setMessages([{ id: '0', role: 'assistant', content: '对话已清空，请重新开始 👋', timestamp: new Date() }])
            } />
          </Tooltip>
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
        {messages.map(msg => (
          <div key={msg.id} style={{
            display: 'flex',
            justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
            marginBottom: 20,
            gap: 10,
            alignItems: 'flex-start',
          }}>
            {msg.role === 'assistant' && (
              <Avatar size={36} style={{ background: '#1677ff', flexShrink: 0, marginTop: 2 }} icon={<RobotOutlined />} />
            )}

            <div style={{ maxWidth: '72%' }}>
              {msg.isTyping ? (
                <div style={{ background: '#fff', borderRadius: '12px 12px 12px 2px', padding: '14px 18px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
                  <span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" />
                </div>
              ) : (
                <>
                  <div style={{
                    background: msg.role === 'user' ? '#1677ff' : '#fff',
                    color: msg.role === 'user' ? '#fff' : '#1a1a1a',
                    borderRadius: msg.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                    padding: '12px 16px',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
                    lineHeight: 1.7,
                  }}>
                    <div className={`md-content ${msg.role === 'user' ? 'md-user' : ''}`}>
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                    </div>
                  </div>

                  {/* Resource cards */}
                  {msg.resources && msg.resources.length > 0 && (
                    <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {msg.resources.map((r, i) => {
                        const cfg = RESOURCE_CONFIG[r.type]
                        return (
                          <div key={i} className="resource-card" style={{
                            background: '#fff',
                            border: `1px solid ${cfg.color}22`,
                            borderLeft: `3px solid ${cfg.color}`,
                            borderRadius: 8,
                            padding: '8px 14px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            cursor: 'pointer',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                          }}>
                            <span style={{ color: cfg.color, fontSize: 16 }}>{cfg.icon}</span>
                            <div>
                              <div style={{ fontSize: 11, color: cfg.color, fontWeight: 600 }}>{cfg.label}</div>
                              <div style={{ fontSize: 12, color: '#595959' }}>{r.title}</div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  <div style={{ fontSize: 11, color: '#bfbfbf', marginTop: 4, textAlign: msg.role === 'user' ? 'right' : 'left', paddingLeft: 4 }}>
                    {msg.timestamp.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </>
              )}
            </div>

            {msg.role === 'user' && (
              <Avatar size={36} style={{ background: '#f0f0f0', color: '#595959', flexShrink: 0, marginTop: 2 }} icon={<UserOutlined />} />
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Quick actions */}
      {messages.length <= 1 && (
        <div style={{ padding: '0 24px 12px', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {QUICK_ACTIONS.map(a => (
            <Tag key={a} color="blue" style={{ cursor: 'pointer', padding: '4px 12px', borderRadius: 20, fontSize: 13 }} onClick={() => send(a)}>
              {a}
            </Tag>
          ))}
        </div>
      )}

      {/* Input */}
      <div style={{
        padding: '12px 24px 16px',
        background: '#fff',
        borderTop: '1px solid #f0f0f0',
        display: 'flex',
        gap: 10,
        alignItems: 'flex-end',
      }}>
        <Input.TextArea
          value={input}
          onChange={e => setInput(e.target.value)}
          onPressEnter={e => { if (!e.shiftKey) { e.preventDefault(); send() } }}
          placeholder="输入消息，按 Enter 发送（Shift+Enter 换行）"
          autoSize={{ minRows: 1, maxRows: 5 }}
          style={{ borderRadius: 10, fontSize: 14, resize: 'none' }}
          disabled={loading}
        />
        <Button
          type="primary"
          icon={<SendOutlined />}
          onClick={() => send()}
          loading={loading}
          disabled={!input.trim()}
          style={{ height: 38, borderRadius: 10, paddingLeft: 16, paddingRight: 16, flexShrink: 0 }}
        >
          发送
        </Button>
      </div>
    </div>
  )
}

export default ChatPage
