import React, { useState } from 'react'
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { Layout, Menu, Avatar, Typography, Badge, Tooltip } from 'antd'
import {
  MessageOutlined,
  UserOutlined,
  ApartmentOutlined,
  BookOutlined,
  BarChartOutlined,
  BulbOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
} from '@ant-design/icons'
import ChatPage from './pages/ChatPage'
import ProfilePage from './pages/ProfilePage'
import LearningPathPage from './pages/LearningPathPage'
import ResourcesPage from './pages/ResourcesPage'
import EvaluationPage from './pages/EvaluationPage'

const { Sider, Content } = Layout
const { Text } = Typography

const menuItems = [
  { key: '/chat',       icon: <MessageOutlined />,  label: '智能对话' },
  { key: '/profile',    icon: <UserOutlined />,     label: '学习画像' },
  { key: '/path',       icon: <ApartmentOutlined />, label: '学习路径' },
  { key: '/resources',  icon: <BookOutlined />,     label: '资源库' },
  { key: '/evaluation', icon: <BarChartOutlined />, label: '学习评估' },
]

const App: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        collapsible
        collapsed={collapsed}
        trigger={null}
        width={220}
        style={{
          background: '#fff',
          borderRight: '1px solid #f0f0f0',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Logo */}
        <div style={{
          height: 64,
          display: 'flex',
          alignItems: 'center',
          padding: collapsed ? '0 24px' : '0 20px',
          borderBottom: '1px solid #f0f0f0',
          gap: 10,
          overflow: 'hidden',
          whiteSpace: 'nowrap',
        }}>
          <BulbOutlined style={{ fontSize: 22, color: '#1677ff', flexShrink: 0 }} />
          {!collapsed && (
            <div>
              <div style={{ fontWeight: 700, fontSize: 16, color: '#1677ff', lineHeight: 1.2 }}>学径</div>
              <div style={{ fontSize: 11, color: '#8c8c8c' }}>LearnPath</div>
            </div>
          )}
        </div>

        {/* Nav menu */}
        <Menu
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          style={{ flex: 1, border: 'none', marginTop: 8 }}
        />

        {/* Bottom: user + collapse */}
        <div style={{ borderTop: '1px solid #f0f0f0', padding: '12px 16px' }}>
          {!collapsed && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <Avatar size={32} style={{ background: '#1677ff', flexShrink: 0 }}>学</Avatar>
              <div style={{ overflow: 'hidden' }}>
                <Text strong style={{ fontSize: 13, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>演示学生</Text>
                <Text type="secondary" style={{ fontSize: 11 }}>AI专业 · 大三</Text>
              </div>
            </div>
          )}
          <div
            onClick={() => setCollapsed(!collapsed)}
            style={{ cursor: 'pointer', color: '#8c8c8c', display: 'flex', justifyContent: collapsed ? 'center' : 'flex-end' }}
          >
            {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          </div>
        </div>
      </Sider>

      <Content style={{ overflow: 'auto', background: '#f5f7fa' }}>
        <Routes>
          <Route path="/" element={<Navigate to="/chat" replace />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/path" element={<LearningPathPage />} />
          <Route path="/resources" element={<ResourcesPage />} />
          <Route path="/evaluation" element={<EvaluationPage />} />
        </Routes>
      </Content>
    </Layout>
  )
}

export default App
