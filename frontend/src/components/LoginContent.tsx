"use client";

import { useEffect, useRef, useState } from "react";
import {
  Button,
  Form,
  Input,
  Select,
  Typography,
  Tabs,
  Tooltip,
  message,
  Divider,
} from "antd";
import BulbOutlined from "@ant-design/icons/BulbOutlined";
import ArrowRightOutlined from "@ant-design/icons/ArrowRightOutlined";
import LeftOutlined from "@ant-design/icons/LeftOutlined";
import MailOutlined from "@ant-design/icons/MailOutlined";
import SafetyOutlined from "@ant-design/icons/SafetyOutlined";
import QqOutlined from "@ant-design/icons/QqOutlined";
import WechatOutlined from "@ant-design/icons/WechatOutlined";
import ThunderboltOutlined from "@ant-design/icons/ThunderboltOutlined";
import { sendOtp, verifyOtp } from "@/lib/api";
import { preloadEcharts } from "@/lib/useEcharts";
import { useAppStore } from "@/store/appStore";

const { Title, Text } = Typography;

const PAGE_CHUNKS = [
  () => import("@/components/pages/ChatContent"),
  () => import("@/components/pages/ProfileContent"),
  () => import("@/components/pages/PathContent"),
  () => import("@/components/pages/ResourcesContent"),
  () => import("@/components/pages/EvaluationContent"),
  () => import("@/components/pages/AccountContent"),
  () => import("@/components/pages/SettingsContent"),
];

const COURSE_OPTIONS = [
  { value: "机器学习导论", label: "机器学习导论" },
  { value: "深度学习基础", label: "深度学习基础" },
  { value: "数据结构与算法", label: "数据结构与算法" },
  { value: "计算机网络", label: "计算机网络" },
];

const OTP_COOLDOWN = 60;

export default function LoginContent() {
  const login = useAppStore((s) => s.login);
  const setShowLanding = useAppStore((s) => s.setShowLanding);
  const [demoForm] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<"demo" | "real">("demo");

  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [sendingOtp, setSendingOtp] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [verifying, setVerifying] = useState(false);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 登录页静默预加载（无进度 UI，登录后由 InitLoadingScreen 展示）
  useEffect(() => {
    PAGE_CHUNKS.forEach((fn) => void fn().catch(() => {}));
    void preloadEcharts().catch(() => {});
  }, []);

  useEffect(() => () => { if (countdownRef.current) clearInterval(countdownRef.current); }, []);

  const handleDemoLogin = () => {
    const values = demoForm.getFieldsValue() as { name: string; course: string };
    setSubmitting(true);
    login(values.name || "演示学生", values.course || "机器学习导论");
  };

  const handleSendOtp = async () => {
    if (!email.trim() || !email.includes("@")) {
      message.warning("请输入有效的邮箱地址");
      return;
    }
    setSendingOtp(true);
    try {
      const res = await sendOtp(email.trim().toLowerCase());
      setOtpSent(true);
      setCountdown(OTP_COOLDOWN);
      countdownRef.current = setInterval(() => {
        setCountdown((c) => {
          if (c <= 1) {
            clearInterval(countdownRef.current!);
            return 0;
          }
          return c - 1;
        });
      }, 1000);
      if (res.debug_code) {
        message.info(`[调试] 验证码：${res.debug_code}`, 12);
      } else {
        message.success("验证码已发送，请查收邮件");
      }
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : "发送失败");
    } finally {
      setSendingOtp(false);
    }
  };

  const handleOtpLogin = async () => {
    if (!otp.trim() || otp.length !== 6) {
      message.warning("请输入 6 位验证码");
      return;
    }
    setVerifying(true);
    try {
      const user = await verifyOtp(email.trim().toLowerCase(), otp.trim());
      setSubmitting(true);
      login(
        user.display_name || user.email.split("@")[0],
        "机器学习导论",
        user.user_id,
        user.email
      );
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : "验证失败");
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-orb login-orb-1" />
      <div className="login-orb login-orb-2" />

      <button type="button" className="login-back" onClick={() => setShowLanding(true)}>
        <LeftOutlined />
        返回介绍页
      </button>

      <div className="login-card">
        <div className="login-card-header">
          <div className="login-card-logo">
            <BulbOutlined />
          </div>
          <div>
            <Title level={3} style={{ margin: 0, color: "#0f172a" }}>
              欢迎使用学径 👋
            </Title>
            <Text type="secondary" style={{ fontSize: 13 }}>
              登录或注册后，将进入加载界面并开启学习
            </Text>
          </div>
        </div>

        <Tabs
          activeKey={activeTab}
          onChange={(k) => setActiveTab(k as "demo" | "real")}
          items={[
            {
              key: "demo",
              label: (
                <span>
                  <ThunderboltOutlined /> 快速体验
                </span>
              ),
              children: (
                <div>
                  <Form
                    form={demoForm}
                    layout="vertical"
                    initialValues={{ name: "演示学生", course: "机器学习导论" }}
                    onFinish={handleDemoLogin}
                  >
                    <Form.Item
                      label="学习者姓名"
                      name="name"
                      rules={[{ required: true, message: "请输入姓名" }]}
                    >
                      <Input size="large" placeholder="请输入你的姓名" />
                    </Form.Item>
                    <Form.Item label="学习课程" name="course">
                      <Select size="large" options={COURSE_OPTIONS} />
                    </Form.Item>
                    <Form.Item style={{ marginBottom: 0 }}>
                      <Button
                        type="primary"
                        htmlType="submit"
                        size="large"
                        icon={<ArrowRightOutlined />}
                        iconPosition="end"
                        loading={submitting}
                        block
                        className="login-submit-btn"
                      >
                        开始学习
                      </Button>
                    </Form.Item>
                  </Form>
                  <div className="login-hint login-hint--blue">
                    💡 <strong>演示模式：</strong>默认账号 userId=&quot;demo&quot;，点击即可体验完整功能。
                  </div>
                </div>
              ),
            },
            {
              key: "real",
              label: (
                <span>
                  <MailOutlined /> 登录 / 注册
                </span>
              ),
              children: (
                <div>
                  <div className="login-field">
                    <label>邮箱地址</label>
                    <div className="login-field-row">
                      <Input
                        size="large"
                        prefix={<MailOutlined style={{ color: "#bbb" }} />}
                        placeholder="请输入邮箱"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        onPressEnter={!otpSent ? handleSendOtp : undefined}
                      />
                      <Button
                        size="large"
                        onClick={handleSendOtp}
                        loading={sendingOtp}
                        disabled={countdown > 0}
                      >
                        {countdown > 0 ? `${countdown}s` : otpSent ? "重发" : "发送验证码"}
                      </Button>
                    </div>
                  </div>
                  <div className="login-field">
                    <label>验证码</label>
                    <Input
                      size="large"
                      prefix={<SafetyOutlined style={{ color: "#bbb" }} />}
                      placeholder="6 位验证码"
                      maxLength={6}
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                      onPressEnter={handleOtpLogin}
                      style={{ letterSpacing: 4, fontWeight: 600 }}
                    />
                  </div>
                  <Button
                    type="primary"
                    size="large"
                    icon={<ArrowRightOutlined />}
                    iconPosition="end"
                    onClick={handleOtpLogin}
                    loading={verifying || submitting}
                    disabled={!otpSent || otp.length < 6}
                    block
                    className="login-submit-btn"
                  >
                    登录 / 注册
                  </Button>
                  <Divider style={{ margin: "18px 0", fontSize: 12 }}>或使用社交账号</Divider>
                  <div className="login-social">
                    <Tooltip title="需配置 QQ AppID">
                      <Button size="large" icon={<QqOutlined />} disabled block>
                        QQ
                      </Button>
                    </Tooltip>
                    <Tooltip title="需配置微信 AppID">
                      <Button size="large" icon={<WechatOutlined />} disabled block>
                        微信
                      </Button>
                    </Tooltip>
                  </div>
                  <div className="login-hint login-hint--warn">
                    ⚠️ 未配置 SMTP 时验证码以弹窗展示；OTP 5 分钟有效，新邮箱自动注册。
                  </div>
                </div>
              ),
            },
          ]}
        />
      </div>
    </div>
  );
}
