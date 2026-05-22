"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Input, Button, Avatar, Tag, Tooltip } from "antd";
import SendOutlined from "@ant-design/icons/SendOutlined";
import UserOutlined from "@ant-design/icons/UserOutlined";
import RobotOutlined from "@ant-design/icons/RobotOutlined";
import ReloadOutlined from "@ant-design/icons/ReloadOutlined";
import dynamic from "next/dynamic";
import { chat, getProfile, streamChat } from "@/lib/api";
import { RESOURCE_CONFIG, mapApiType } from "@/lib/resourceConfig";
import { useAppStore } from "@/store/appStore";

// 懒加载重型 Markdown 渲染器，避免阻塞首屏
const MarkdownPreview = dynamic(() => import("@/components/MarkdownPreview"), {
  ssr: false,
  loading: () => <span style={{ color: "#ccc" }}>…</span>,
});

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  resources?: { type: string; title: string }[];
  timestamp: Date;
  isTyping?: boolean;
}

const QUICK_ACTIONS = [
  "帮我构建学习画像",
  "生成线性回归学习资源",
  "制定一个月学习计划",
  "解释梯度下降算法",
];

// 单条消息 —— 用 memo 确保流式更新时仅重绘当前气泡
const MessageItem = memo(function MessageItem({
  msg,
  onSend,
}: {
  msg: Message;
  onSend?: (text: string) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
        marginBottom: 20,
        gap: 10,
        alignItems: "flex-start",
      }}
    >
      {msg.role === "assistant" && (
        <Avatar
          size={36}
          style={{ background: "#1677ff", flexShrink: 0, marginTop: 2 }}
          icon={<RobotOutlined />}
        />
      )}

      <div style={{ maxWidth: "72%" }}>
        {msg.isTyping ? (
          <div
            style={{
              background: "#fff",
              borderRadius: "12px 12px 12px 2px",
              padding: "14px 18px",
              boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
            }}
          >
            <span className="typing-dot" />
            <span className="typing-dot" />
            <span className="typing-dot" />
          </div>
        ) : (
          <>
            <div
              style={{
                background: msg.role === "user" ? "#1677ff" : "#fff",
                color: msg.role === "user" ? "#fff" : "#1a1a1a",
                borderRadius:
                  msg.role === "user" ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
                padding: "12px 16px",
                boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
                lineHeight: 1.7,
              }}
            >
              <div className={`md-content ${msg.role === "user" ? "md-user" : ""}`}>
                <MarkdownPreview content={msg.content || "　"} />
              </div>
            </div>

            {msg.resources && msg.resources.length > 0 && (
              <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 8 }}>
                {msg.resources.map((r, i) => {
                  const uiType = mapApiType(r.type);
                  const cfg = RESOURCE_CONFIG[uiType];
                  return (
                    <div
                      key={i}
                      className="resource-card"
                      style={{
                        background: "#fff",
                        border: `1px solid ${cfg.color}22`,
                        borderLeft: `3px solid ${cfg.color}`,
                        borderRadius: 8,
                        padding: "8px 14px",
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        cursor: "pointer",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                      }}
                    >
                      <span style={{ color: cfg.color, fontSize: 16 }}>{cfg.icon}</span>
                      <div>
                        <div style={{ fontSize: 11, color: cfg.color, fontWeight: 600 }}>
                          {cfg.label}
                        </div>
                        <div style={{ fontSize: 12, color: "#595959" }}>{r.title}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div
              style={{
                fontSize: 11,
                color: "#bfbfbf",
                marginTop: 4,
                textAlign: msg.role === "user" ? "right" : "left",
                paddingLeft: 4,
              }}
            >
              {msg.timestamp.toLocaleTimeString("zh-CN", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </div>
          </>
        )}
      </div>

      {msg.role === "user" && (
        <Avatar
          size={36}
          style={{ background: "#f0f0f0", color: "#595959", flexShrink: 0, marginTop: 2 }}
          icon={<UserOutlined />}
        />
      )}
    </div>
  );
});

export default function ChatContent() {
  const userId = useAppStore((s) => s.userId);
  const setProfile = useAppStore((s) => s.setProfile);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "0",
      role: "assistant",
      content: `你好！我是 **学径 LearnPath 学习助手** 🎓\n\n我可以帮你：\n- 📊 **构建个人学习画像** — 通过对话了解你的学习情况\n- 📚 **生成个性化学习资源** — 文档、思维导图、题库、多模态说明、代码案例\n- 🗺️ **规划学习路径** — 科学分阶段的个性化学习计划\n- 🤔 **解答学习疑问** — 随时提问，RAG 知识库支撑\n\n请告诉我你想学习什么，或点击下方快捷操作开始 👇`,
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = useCallback(
    async (text?: string) => {
      const content = (text ?? input).trim();
      if (!content || loading) return;
      setInput("");

      const userMsg: Message = {
        id: Date.now().toString(),
        role: "user",
        content,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setLoading(true);

      const typingId = "typing";
      setMessages((prev) => [
        ...prev,
        { id: typingId, role: "assistant", content: "", isTyping: true, timestamp: new Date() },
      ]);

      try {
        const replyId = (Date.now() + 1).toString();
        setMessages((prev) =>
          prev
            .filter((m) => m.id !== typingId)
            .concat({ id: replyId, role: "assistant", content: "", timestamp: new Date() })
        );

        let acc = "";
        let finalReply = "";
        await streamChat(
          userId,
          content,
          (token) => {
            acc += token;
            setMessages((prev) =>
              prev.map((m) => (m.id === replyId ? { ...m, content: acc } : m))
            );
          },
          (reply) => {
            finalReply = reply;
          }
        );

        const display = finalReply || acc;
        if (display) {
          setMessages((prev) =>
            prev.map((m) => (m.id === replyId ? { ...m, content: display } : m))
          );
        } else {
          const res = await chat(userId, content);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === replyId ? { ...m, content: res.reply || "处理完成" } : m
            )
          );
          if (res.profile) setProfile(res.profile);
        }

        try {
          const p = await getProfile(userId);
          if (p) setProfile(p);
        } catch {
          /* 画像尚未生成时忽略 */
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "未知错误";
        setMessages((prev) =>
          prev
            .filter((m) => m.id !== typingId)
            .concat({
              id: Date.now().toString(),
              role: "assistant",
              content: `⚠️ 连接失败：${msg}\n\n请确保后端已启动（http://localhost:8000）`,
              timestamp: new Date(),
            })
        );
      } finally {
        setLoading(false);
      }
    },
    [input, loading, userId, setProfile]
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: "100vh" }}>
      <div
        style={{
          padding: "14px 24px",
          background: "#fff",
          borderBottom: "1px solid #f0f0f0",
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexShrink: 0,
        }}
      >
        <RobotOutlined style={{ fontSize: 20, color: "#1677ff" }} />
        <div>
          <div style={{ fontWeight: 600, fontSize: 15 }}>智能学习助手</div>
          <div style={{ fontSize: 12, color: "#52c41a" }}>● 在线 · 讯飞星火 / Mock</div>
        </div>
        <div style={{ marginLeft: "auto" }}>
          <Tooltip title="清空对话">
            <Button
              icon={<ReloadOutlined />}
              size="small"
              onClick={() =>
                setMessages([
                  {
                    id: "0",
                    role: "assistant",
                    content: "对话已清空，请重新开始 👋",
                    timestamp: new Date(),
                  },
                ])
              }
            />
          </Tooltip>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
        {messages.map((msg) => (
          <MessageItem key={msg.id} msg={msg} onSend={send} />
        ))}
        <div ref={bottomRef} />
      </div>

      {messages.length <= 1 && (
        <div style={{ padding: "0 24px 12px", display: "flex", flexWrap: "wrap", gap: 8 }}>
          {QUICK_ACTIONS.map((a) => (
            <Tag
              key={a}
              color="blue"
              style={{ cursor: "pointer", padding: "4px 12px", borderRadius: 20, fontSize: 13 }}
              onClick={() => send(a)}
            >
              {a}
            </Tag>
          ))}
        </div>
      )}

      <div
        style={{
          padding: "12px 24px 16px",
          background: "#fff",
          borderTop: "1px solid #f0f0f0",
          display: "flex",
          gap: 10,
          alignItems: "flex-end",
        }}
      >
        <Input.TextArea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onPressEnter={(e) => {
            if (!e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="输入消息，按 Enter 发送（Shift+Enter 换行）"
          autoSize={{ minRows: 1, maxRows: 5 }}
          style={{ borderRadius: 10, fontSize: 14, resize: "none" }}
          disabled={loading}
        />
        <Button
          type="primary"
          icon={<SendOutlined />}
          onClick={() => send()}
          loading={loading}
          disabled={!input.trim()}
          style={{
            height: 38,
            borderRadius: 10,
            paddingLeft: 16,
            paddingRight: 16,
            flexShrink: 0,
          }}
        >
          发送
        </Button>
      </div>
    </div>
  );
}
