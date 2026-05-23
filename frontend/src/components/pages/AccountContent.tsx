"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Avatar,
  Button,
  Card,
  Col,
  Descriptions,
  Form,
  Input,
  Row,
  Select,
  Space,
  Tag,
  Typography,
  message,
} from "antd";
import IdcardOutlined from "@ant-design/icons/IdcardOutlined";
import EditOutlined from "@ant-design/icons/EditOutlined";
import SaveOutlined from "@ant-design/icons/SaveOutlined";
import MailOutlined from "@ant-design/icons/MailOutlined";
import ReadOutlined from "@ant-design/icons/ReadOutlined";
import LinkOutlined from "@ant-design/icons/LinkOutlined";
import TrophyOutlined from "@ant-design/icons/TrophyOutlined";
import RightOutlined from "@ant-design/icons/RightOutlined";
import PageHeader from "@/components/PageHeader";
import { clientNavigate } from "@/lib/clientNav";
import { computeInsights } from "@/lib/insightsCompute";
import { pathProgress } from "@/lib/navMeta";
import { getAccount, updateAccount, type UserAccount } from "@/lib/api";
import { useAppStore } from "@/store/appStore";

const { Title, Text, Paragraph } = Typography;

const COURSE_OPTIONS = [
  "机器学习导论",
  "深度学习基础",
  "数据结构与算法",
  "计算机网络",
];

export default function AccountContent() {
  const userId = useAppStore((s) => s.userId);
  const userName = useAppStore((s) => s.userName);
  const courseName = useAppStore((s) => s.courseName);
  const userEmail = useAppStore((s) => s.userEmail);
  const setUserMeta = useAppStore((s) => s.setUserMeta);

  const [account, setAccount] = useState<UserAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAccount(userId);
      setAccount(data);
    } catch {
      setAccount({
        user_id: userId,
        display_name: userName,
        email: userEmail,
        course_name: courseName,
        major: "",
        bio: "",
        phone: "",
      });
    } finally {
      setLoading(false);
    }
  }, [userId, userName, userEmail, courseName]);

  useEffect(() => {
    void load();
  }, [load]);

  const startEdit = () => {
    if (!account) return;
    form.setFieldsValue({
      display_name: account.display_name,
      course_name: account.course_name,
      major: account.major,
      bio: account.bio,
      phone: account.phone,
    });
    setEditing(true);
  };

  const handleSave = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      const updated = await updateAccount(userId, values);
      setAccount(updated);
      setUserMeta({
        userName: updated.display_name,
        courseName: updated.course_name,
      });
      setEditing(false);
      message.success("个人信息已保存");
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const evalStats = useAppStore((s) => s.evalStats);
  const learningPath = useAppStore((s) => s.learningPath);
  const profile = useAppStore((s) => s.profile);

  const insightPreview = computeInsights({
    stats: evalStats,
    learningPath,
    profile,
    chatCount: 0,
    userMsgCount: 0,
  });

  const initial = account?.display_name?.charAt(0) || userName?.charAt(0) || "学";

  return (
    <div>
      <PageHeader
        title="个人主页"
        subtitle="账号资料与学习身份 · 与学习画像（AI 抽取）区分"
        icon={<IdcardOutlined />}
        extra={
          editing ? (
            <Space>
              <Button onClick={() => setEditing(false)}>取消</Button>
              <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={() => void handleSave()}>
                保存
              </Button>
            </Space>
          ) : (
            <Button type="primary" icon={<EditOutlined />} onClick={startEdit} disabled={loading}>
              编辑资料
            </Button>
          )
        }
      />
      <div className="lp-page-body">
        <Row gutter={[20, 20]}>
          <Col span={24}>
            <button
              type="button"
              className="lp-account-insights-entry"
              onClick={() => clientNavigate("/insights")}
            >
              <div className="lp-account-insights-entry-glow" aria-hidden />
              <div className="lp-account-insights-entry-main">
                <span className="lp-account-insights-entry-icon">
                  <TrophyOutlined />
                </span>
                <div className="lp-account-insights-entry-text">
                  <Title level={5} style={{ margin: 0, color: "inherit" }}>
                    学习成就馆
                  </Title>
                  <Text style={{ color: "rgba(255,255,255,0.82)", fontSize: 13 }}>
                    查看学力等级、成就徽章与可视化成长数据
                  </Text>
                </div>
              </div>
              <div className="lp-account-insights-entry-stats">
                <span>
                  Lv.{insightPreview.level} · {insightPreview.xp} XP
                </span>
                <span>路径 {pathProgress(learningPath?.steps)}%</span>
                <span>{insightPreview.unlockedCount} 项成就</span>
              </div>
              <RightOutlined className="lp-account-insights-entry-arrow" />
            </button>
          </Col>
          <Col xs={24} lg={8}>
            <Card loading={loading}>
              <div className="lp-account-hero">
                <Avatar size={72} className="learnpath-user-avatar">
                  {initial}
                </Avatar>
                <TitleBlock account={account} fallbackName={userName} fallbackCourse={courseName} />
                <Space wrap style={{ marginTop: 12 }}>
                  <Button type="link" icon={<LinkOutlined />} onClick={() => clientNavigate("/profile")}>
                    查看学习画像
                  </Button>
                  <Button type="link" onClick={() => clientNavigate("/settings")}>
                    打开设置
                  </Button>
                </Space>
              </div>
            </Card>
          </Col>

          <Col xs={24} lg={16}>
            {editing ? (
              <Card title="编辑个人信息">
                <Form form={form} layout="vertical">
                  <Row gutter={16}>
                    <Col xs={24} sm={12}>
                      <Form.Item name="display_name" label="昵称" rules={[{ required: true, message: "请输入昵称" }]}>
                        <Input maxLength={32} />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={12}>
                      <Form.Item name="course_name" label="主修课程">
                        <Select
                          options={COURSE_OPTIONS.map((c) => ({ value: c, label: c }))}
                          showSearch
                          allowClear
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={12}>
                      <Form.Item name="major" label="专业方向">
                        <Input placeholder="如：计算机科学" maxLength={64} />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={12}>
                      <Form.Item name="phone" label="联系电话">
                        <Input placeholder="选填" maxLength={20} />
                      </Form.Item>
                    </Col>
                    <Col span={24}>
                      <Form.Item name="bio" label="个人简介">
                        <Input.TextArea rows={4} maxLength={300} showCount placeholder="一句话介绍你的学习目标…" />
                      </Form.Item>
                    </Col>
                  </Row>
                </Form>
              </Card>
            ) : (
              <Card title="基本信息" loading={loading}>
                <Descriptions column={1} bordered size="middle">
                  <Descriptions.Item label="用户 ID">
                    <Text copyable>{account?.user_id ?? userId}</Text>
                  </Descriptions.Item>
                  <Descriptions.Item label="邮箱">
                    <Space>
                      <MailOutlined />
                      {account?.email || userEmail || "—"}
                    </Space>
                  </Descriptions.Item>
                  <Descriptions.Item label="昵称">{account?.display_name ?? userName}</Descriptions.Item>
                  <Descriptions.Item label="主修课程">
                    <Tag icon={<ReadOutlined />} bordered={false}>
                      {account?.course_name ?? courseName}
                    </Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="专业">{account?.major || "—"}</Descriptions.Item>
                  <Descriptions.Item label="电话">{account?.phone || "—"}</Descriptions.Item>
                  <Descriptions.Item label="简介">
                    <Paragraph style={{ margin: 0 }}>
                      {account?.bio || "暂无简介，点击右上角编辑资料。"}
                    </Paragraph>
                  </Descriptions.Item>
                </Descriptions>
              </Card>
            )}
          </Col>
        </Row>
      </div>
    </div>
  );
}

function TitleBlock({
  account,
  fallbackName,
  fallbackCourse,
}: {
  account: UserAccount | null;
  fallbackName: string;
  fallbackCourse: string;
}) {
  return (
    <div className="lp-account-hero-text">
      <Title level={4} style={{ margin: "12px 0 4px" }}>
        {account?.display_name ?? fallbackName}
      </Title>
      <Text type="secondary">{account?.email || "未绑定邮箱"}</Text>
      <div style={{ marginTop: 8 }}>
        <Tag icon={<ReadOutlined />} color="blue">
          {account?.course_name ?? fallbackCourse}
        </Tag>
        {account?.major ? <Tag>{account.major}</Tag> : null}
      </div>
    </div>
  );
}
