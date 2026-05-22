"use client";

import { useEffect, useRef, useState } from "react";
import {
  Button,
  Form,
  Input,
  Select,
  Progress,
  Typography,
  Tabs,
  Tooltip,
  message,
  Divider,
} from "antd";
import BulbOutlined from "@ant-design/icons/BulbOutlined";
import BookOutlined from "@ant-design/icons/BookOutlined";
import MessageOutlined from "@ant-design/icons/MessageOutlined";
import ApartmentOutlined from "@ant-design/icons/ApartmentOutlined";
import BarChartOutlined from "@ant-design/icons/BarChartOutlined";
import ArrowRightOutlined from "@ant-design/icons/ArrowRightOutlined";
import MailOutlined from "@ant-design/icons/MailOutlined";
import SafetyOutlined from "@ant-design/icons/SafetyOutlined";
import QqOutlined from "@ant-design/icons/QqOutlined";
import WechatOutlined from "@ant-design/icons/WechatOutlined";
import ThunderboltOutlined from "@ant-design/icons/ThunderboltOutlined";
import { sendOtp, verifyOtp } from "@/lib/api";
import { preloadEcharts } from "@/lib/useEcharts";
import { useAppStore } from "@/store/appStore";

const { Title, Text } = Typography;

// 需要预加载的页面 chunk（在登录页展示时就开始后台加载）
const PAGE_CHUNKS = [
  () => import("@/components/pages/ChatContent"),
  () => import("@/components/pages/ProfileContent"),
  () => import("@/components/pages/PathContent"),
  () => import("@/components/pages/ResourcesContent"),
  () => import("@/components/pages/EvaluationContent"),
];

const COURSE_OPTIONS = [
  { value: "机器学习导论", label: "机器学习导论" },
  { value: "深度学习基础", label: "深度学习基础" },
  { value: "数据结构与算法", label: "数据结构与算法" },
  { value: "计算机网络", label: "计算机网络" },
];

const FEATURES = [
  {
    icon: <MessageOutlined style={{ fontSize: 20, color: "#1677ff" }} />,
    title: "智能对话助手",
    desc: "多轮对话，构建精准学习画像",
  },
  {
    icon: <BookOutlined style={{ fontSize: 20, color: "#52c41a" }} />,
    title: "个性化资源生成",
    desc: "多智能体协同生成文档、题库、思维导图",
  },
  {
    icon: <ApartmentOutlined style={{ fontSize: 20, color: "#fa8c16" }} />,
    title: "科学学习路径",
    desc: "根据画像动态规划分阶段学习计划",
  },
  {
    icon: <BarChartOutlined style={{ fontSize: 20, color: "#722ed1" }} />,
    title: "学习效果评估",
    desc: "多维度量化追踪学习成效与成长",
  },
];

const OTP_COOLDOWN = 60;

export default function LoginContent() {
  const login = useAppStore((s) => s.login);
  const [demoForm] = Form.useForm();
  const [loadedCount, setLoadedCount] = useState(0);
  const [entering, setEntering] = useState(false);
  const [activeTab, setActiveTab] = useState<"demo" | "real">("demo");

  // ── 邮箱 OTP 状态 ──────────────────────────────────────────────────────────
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [sendingOtp, setSendingOtp] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [verifying, setVerifying] = useState(false);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const totalChunks = PAGE_CHUNKS.length + 1;
  const isReady = loadedCount >= totalChunks;
  const progress = Math.round((loadedCount / totalChunks) * 100);

  // 登录页挂载后立即在后台加载所有 chunk
  useEffect(() => {
    let loaded = 0;
    const tick = () => { loaded += 1; setLoadedCount(loaded); };
    PAGE_CHUNKS.forEach((fn) => fn().then(tick).catch(tick));
    preloadEcharts().then(tick).catch(tick);
  }, []);

  // 倒计时清理
  useEffect(() => () => { if (countdownRef.current) clearInterval(countdownRef.current); }, []);

  // ── 演示模式登录 ──────────────────────────────────────────────────────────
  const handleDemoLogin = () => {
    const values = demoForm.getFieldsValue() as { name: string; course: string };
    setEntering(true);
    setTimeout(() => login(values.name || "演示学生", values.course || "机器学习导论"), 320);
  };

  // ── OTP 发送 ──────────────────────────────────────────────────────────────
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
          if (c <= 1) { clearInterval(countdownRef.current!); return 0; }
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

  // ── OTP 验证登录 ──────────────────────────────────────────────────────────
  const handleOtpLogin = async () => {
    if (!otp.trim() || otp.length !== 6) { message.warning("请输入 6 位验证码"); return; }
    setVerifying(true);
    try {
      const user = await verifyOtp(email.trim().toLowerCase(), otp.trim());
      setEntering(true);
      setTimeout(
        () => login(user.display_name || user.email.split("@")[0], "机器学习导论", user.user_id),
        320,
      );
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : "验证失败");
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #0e4fb0 0%, #1677ff 45%, #36cfc9 100%)",
        padding: "24px 16px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* 背景装饰圆 */}
      <div style={{ position: "absolute", width: 400, height: 400, borderRadius: "50%", background: "rgba(255,255,255,0.05)", top: -120, right: -80, pointerEvents: "none" }} />
      <div style={{ position: "absolute", width: 280, height: 280, borderRadius: "50%", background: "rgba(255,255,255,0.06)", bottom: -60, left: -80, pointerEvents: "none" }} />

      <div
        style={{
          display: "flex",
          gap: 0,
          width: "100%",
          maxWidth: 920,
          borderRadius: 20,
          boxShadow: "0 24px 60px rgba(0,0,0,0.25)",
          overflow: "hidden",
          opacity: entering ? 0 : 1,
          transform: entering ? "scale(0.97)" : "scale(1)",
          transition: "opacity 0.3s ease, transform 0.3s ease",
        }}
      >
        {/* ── 左侧特性介绍 ─────────────────────────────────────── */}
        <div
          className="login-side-panel"
          style={{
            flex: "0 0 340px",
            background: "rgba(255,255,255,0.12)",
            backdropFilter: "blur(16px)",
            padding: "44px 36px",
            display: "flex",
            flexDirection: "column",
            color: "#fff",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 32 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <BulbOutlined style={{ fontSize: 24, color: "#fff" }} />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 22, lineHeight: 1.2, color: "#fff" }}>学径</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)" }}>LearnPath</div>
            </div>
          </div>

          <Title level={4} style={{ color: "#fff", margin: "0 0 8px", fontWeight: 700 }}>个性化学习多智能体系统</Title>
          <Text style={{ color: "rgba(255,255,255,0.75)", fontSize: 13, lineHeight: 1.7, marginBottom: 32 }}>
            AI 驱动的全链路自适应学习平台，从画像建模到资源生成、路径规划、效果评估，一站式闭环。
          </Text>

          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {FEATURES.map((f) => (
              <div key={f.title} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, flexShrink: 0, background: "rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {f.icon}
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14, color: "#fff", marginBottom: 2 }}>{f.title}</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", lineHeight: 1.6 }}>{f.desc}</div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: "auto", paddingTop: 32 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <Text style={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }}>
                {isReady ? "✓ 系统已就绪" : "正在后台加载页面资源…"}
              </Text>
              <Text style={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }}>{progress}%</Text>
            </div>
            <Progress percent={progress} showInfo={false} strokeColor={{ "0%": "#fff", "100%": "rgba(255,255,255,0.4)" }} trailColor="rgba(255,255,255,0.15)" size="small" />
          </div>
        </div>

        {/* ── 右侧登录区域 ──────────────────────────────────────── */}
        <div style={{ flex: 1, background: "#fff", padding: "40px 44px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ marginBottom: 20 }}>
            <Title level={3} style={{ margin: "0 0 4px", color: "#1a1a1a" }}>欢迎使用学径 👋</Title>
            <Text type="secondary" style={{ fontSize: 13 }}>选择登录方式，开启你的个性化学习之旅</Text>
          </div>

          <Tabs
            activeKey={activeTab}
            onChange={(k) => setActiveTab(k as "demo" | "real")}
            items={[
              {
                key: "demo",
                label: <span><ThunderboltOutlined /> 快速体验</span>,
                children: (
                  <div>
                    <Form form={demoForm} layout="vertical" initialValues={{ name: "演示学生", course: "机器学习导论" }} onFinish={handleDemoLogin}>
                      <Form.Item label={<span style={{ fontWeight: 600, color: "#333" }}>学习者姓名</span>} name="name" rules={[{ required: true, message: "请输入姓名" }]}>
                        <Input size="large" placeholder="请输入你的姓名" style={{ borderRadius: 10 }} />
                      </Form.Item>
                      <Form.Item label={<span style={{ fontWeight: 600, color: "#333" }}>学习课程</span>} name="course">
                        <Select size="large" options={COURSE_OPTIONS} style={{ borderRadius: 10 }} />
                      </Form.Item>
                      <Form.Item style={{ marginTop: 8, marginBottom: 0 }}>
                        <Button type="primary" htmlType="submit" size="large" icon={<ArrowRightOutlined />} iconPosition="end" loading={entering} block
                          style={{ height: 50, borderRadius: 12, fontSize: 16, fontWeight: 700, background: "linear-gradient(90deg,#1677ff,#0e4fb0)", border: "none", boxShadow: "0 4px 20px rgba(22,119,255,0.35)" }}>
                          开始学习
                        </Button>
                      </Form.Item>
                    </Form>
                    <div style={{ marginTop: 16, padding: "10px 14px", background: "#f0f7ff", borderRadius: 8, border: "1px dashed #91caff", fontSize: 12, color: "#4096ff" }}>
                      💡 <strong>演示模式：</strong>默认填写演示账号（userId=&quot;demo&quot;），直接点击即可体验完整功能，数据持久保存。
                    </div>
                  </div>
                ),
              },
              {
                key: "real",
                label: <span><MailOutlined /> 登录 / 注册</span>,
                children: (
                  <div>
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontWeight: 600, color: "#333", marginBottom: 6, fontSize: 14 }}>邮箱地址</div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <Input size="large" prefix={<MailOutlined style={{ color: "#bbb" }} />} placeholder="请输入邮箱" value={email} onChange={(e) => setEmail(e.target.value)}
                          style={{ flex: 1, borderRadius: 10 }} onPressEnter={!otpSent ? handleSendOtp : undefined} />
                        <Button size="large" onClick={handleSendOtp} loading={sendingOtp} disabled={countdown > 0} style={{ borderRadius: 10, minWidth: 116, flexShrink: 0 }}>
                          {countdown > 0 ? `${countdown}s 后重发` : otpSent ? "重新发送" : "发送验证码"}
                        </Button>
                      </div>
                    </div>

                    <div style={{ marginBottom: 20 }}>
                      <div style={{ fontWeight: 600, color: "#333", marginBottom: 6, fontSize: 14 }}>验证码</div>
                      <Input size="large" prefix={<SafetyOutlined style={{ color: "#bbb" }} />} placeholder="请输入 6 位验证码" maxLength={6}
                        value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                        style={{ borderRadius: 10, letterSpacing: 4, fontWeight: 600 }} onPressEnter={handleOtpLogin} />
                    </div>

                    <Button type="primary" size="large" icon={<ArrowRightOutlined />} iconPosition="end" onClick={handleOtpLogin}
                      loading={verifying || entering} disabled={!otpSent || otp.length < 6} block
                      style={{ height: 50, borderRadius: 12, fontSize: 16, fontWeight: 700, background: "linear-gradient(90deg,#1677ff,#0e4fb0)", border: "none", boxShadow: "0 4px 20px rgba(22,119,255,0.35)" }}>
                      登录 / 注册
                    </Button>

                    <Divider style={{ margin: "20px 0", fontSize: 12 }}>或使用社交账号登录</Divider>

                    <div style={{ display: "flex", gap: 12 }}>
                      <Tooltip title="需要在后端 .env 配置 QQ AppID 后启用">
                        <Button size="large" icon={<QqOutlined />} disabled block style={{ borderRadius: 10, color: "#12b7f5", borderColor: "#12b7f5" }}>
                          QQ 登录
                        </Button>
                      </Tooltip>
                      <Tooltip title="需要在后端 .env 配置微信 AppID 后启用">
                        <Button size="large" icon={<WechatOutlined />} disabled block style={{ borderRadius: 10, color: "#07c160", borderColor: "#07c160" }}>
                          微信登录
                        </Button>
                      </Tooltip>
                    </div>

                    <div style={{ marginTop: 14, padding: "8px 12px", background: "#fffbe6", borderRadius: 8, border: "1px dashed #ffe58f", fontSize: 12, color: "#ad6800" }}>
                      ⚠️ 未配置 SMTP 时验证码以弹窗形式展示（调试模式）。OTP 5 分钟有效，邮箱不存在时自动注册账号。
                    </div>
                  </div>
                ),
              },
            ]}
          />
        </div>
      </div>

      <style>{`@media (max-width: 640px) { .login-side-panel { display: none !important; } }`}</style>
    </div>
  );
}
