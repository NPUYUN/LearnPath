"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Form, Input, Select, Progress, Typography } from "antd";
import BulbOutlined from "@ant-design/icons/BulbOutlined";
import BookOutlined from "@ant-design/icons/BookOutlined";
import MessageOutlined from "@ant-design/icons/MessageOutlined";
import ApartmentOutlined from "@ant-design/icons/ApartmentOutlined";
import BarChartOutlined from "@ant-design/icons/BarChartOutlined";
import ArrowRightOutlined from "@ant-design/icons/ArrowRightOutlined";
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

export default function LoginContent() {
  const login = useAppStore((s) => s.login);
  const [form] = Form.useForm();
  const [loadedCount, setLoadedCount] = useState(0);
  const [entering, setEntering] = useState(false);
  const totalChunks = PAGE_CHUNKS.length + 1; // +1 for echarts

  // 登录页挂载后立即在后台加载所有 chunk
  useEffect(() => {
    let loaded = 0;
    const tick = () => {
      loaded += 1;
      setLoadedCount(loaded);
    };

    PAGE_CHUNKS.forEach((fn) => fn().then(tick).catch(tick));
    preloadEcharts();
    // ECharts 加载完成计数（近似：用 echarts 模块 promise）
    void import("echarts").then(tick).catch(tick);
  }, []);

  const progress = Math.round((loadedCount / totalChunks) * 100);
  const isReady = loadedCount >= totalChunks;

  const handleLogin = () => {
    const values = form.getFieldsValue() as { name: string; course: string };
    setEntering(true);
    // 短暂延迟以呈现入场动画
    setTimeout(() => {
      login(values.name || "演示学生", values.course || "机器学习导论");
    }, 320);
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
      <div
        style={{
          position: "absolute", width: 400, height: 400, borderRadius: "50%",
          background: "rgba(255,255,255,0.05)", top: -120, right: -80,
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute", width: 280, height: 280, borderRadius: "50%",
          background: "rgba(255,255,255,0.06)", bottom: -60, left: -80,
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          display: "flex",
          gap: 0,
          width: "100%",
          maxWidth: 900,
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
          style={{
            flex: "0 0 340px",
            background: "rgba(255,255,255,0.12)",
            backdropFilter: "blur(16px)",
            padding: "44px 36px",
            display: "flex",
            flexDirection: "column",
            color: "#fff",
          }}
          className="login-side-panel"
        >
          {/* Logo */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 32 }}>
            <div
              style={{
                width: 44, height: 44, borderRadius: 12,
                background: "rgba(255,255,255,0.2)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <BulbOutlined style={{ fontSize: 24, color: "#fff" }} />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 22, lineHeight: 1.2, color: "#fff" }}>学径</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)" }}>LearnPath</div>
            </div>
          </div>

          <Title level={4} style={{ color: "#fff", margin: "0 0 8px", fontWeight: 700 }}>
            个性化学习多智能体系统
          </Title>
          <Text style={{ color: "rgba(255,255,255,0.75)", fontSize: 13, lineHeight: 1.7, marginBottom: 32 }}>
            AI 驱动的全链路自适应学习平台，从画像建模到资源生成、路径规划、效果评估，一站式闭环。
          </Text>

          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {FEATURES.map((f) => (
              <div key={f.title} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                <div
                  style={{
                    width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                    background: "rgba(255,255,255,0.15)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  {/* 图标统一白色在深色背景 */}
                  {f.icon}
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14, color: "#fff", marginBottom: 2 }}>
                    {f.title}
                  </div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", lineHeight: 1.6 }}>
                    {f.desc}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* 加载进度 */}
          <div style={{ marginTop: "auto", paddingTop: 32 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <Text style={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }}>
                {isReady ? "✓ 系统已就绪" : "正在后台加载页面资源…"}
              </Text>
              <Text style={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }}>{progress}%</Text>
            </div>
            <Progress
              percent={progress}
              showInfo={false}
              strokeColor={{ "0%": "#fff", "100%": "rgba(255,255,255,0.4)" }}
              trailColor="rgba(255,255,255,0.15)"
              size="small"
            />
          </div>
        </div>

        {/* ── 右侧登录表单 ──────────────────────────────────────── */}
        <div
          style={{
            flex: 1,
            background: "#fff",
            padding: "48px 44px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
          }}
        >
          <div style={{ marginBottom: 32 }}>
            <Title level={3} style={{ margin: "0 0 6px", color: "#1a1a1a" }}>
              欢迎回来 👋
            </Title>
            <Text type="secondary" style={{ fontSize: 14 }}>
              填写学习信息，开始你的个性化学习之旅
            </Text>
          </div>

          <Form
            form={form}
            layout="vertical"
            initialValues={{ name: "演示学生", course: "机器学习导论" }}
            onFinish={handleLogin}
            style={{ width: "100%" }}
          >
            <Form.Item
              label={<span style={{ fontWeight: 600, color: "#333" }}>学习者姓名</span>}
              name="name"
              rules={[{ required: true, message: "请输入姓名" }]}
            >
              <Input
                size="large"
                placeholder="请输入你的姓名"
                style={{ borderRadius: 10 }}
              />
            </Form.Item>

            <Form.Item
              label={<span style={{ fontWeight: 600, color: "#333" }}>学习课程</span>}
              name="course"
            >
              <Select
                size="large"
                options={COURSE_OPTIONS}
                style={{ borderRadius: 10 }}
              />
            </Form.Item>

            <Form.Item style={{ marginTop: 8, marginBottom: 0 }}>
              <Button
                type="primary"
                htmlType="submit"
                size="large"
                icon={<ArrowRightOutlined />}
                iconPosition="end"
                loading={entering}
                block
                style={{
                  height: 50,
                  borderRadius: 12,
                  fontSize: 16,
                  fontWeight: 700,
                  background: "linear-gradient(90deg, #1677ff, #0e4fb0)",
                  border: "none",
                  boxShadow: "0 4px 20px rgba(22,119,255,0.35)",
                }}
              >
                开始学习
              </Button>
            </Form.Item>
          </Form>

          {/* 测试提示 */}
          <div
            style={{
              marginTop: 20,
              padding: "10px 14px",
              background: "#f0f7ff",
              borderRadius: 8,
              border: "1px dashed #91caff",
              fontSize: 12,
              color: "#4096ff",
            }}
          >
            💡 <strong>测试模式：</strong>默认已填写演示账号，直接点击「开始学习」即可体验完整功能。
          </div>
        </div>
      </div>
    </div>
  );
}
