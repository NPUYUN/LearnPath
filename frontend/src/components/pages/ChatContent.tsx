"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Input, Button, Avatar, Tag, Tooltip, Switch } from "antd";
import SendOutlined from "@ant-design/icons/SendOutlined";
import BulbOutlined from "@ant-design/icons/BulbOutlined";
import UserOutlined from "@ant-design/icons/UserOutlined";
import RobotOutlined from "@ant-design/icons/RobotOutlined";
import ReloadOutlined from "@ant-design/icons/ReloadOutlined";
import dynamic from "next/dynamic";
import PageHeader from "@/components/PageHeader";
import {
  appendChatHistory,
  checkHealth,
  formatLlmRouting,
  getHealth,
  getChatHistory,
  getEvalStats,
  getPath,
  getProfile,
  getRecommendations,
  listResources,
  streamChat,
  type ResourceRecommendation,
  type ResourceSummary,
} from "@/lib/api";
import { clientNavigate } from "@/lib/clientNav";
import { RESOURCE_CONFIG, mapApiType } from "@/lib/resourceConfig";
import { playAssistantSpeech } from "@/lib/tts";
import { isDemoUser, useAppStore } from "@/store/appStore";
import { useSettingsStore } from "@/store/settingsStore";

// 懒加载重型 Markdown 渲染器，避免阻塞首屏
const MarkdownPreview = dynamic(() => import("@/components/MarkdownPreview"), {
  ssr: false,
  loading: () => <span style={{ color: "#ccc" }}>…</span>,
});

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  resources?: ResourceSummary[];
  timestamp: Date;
  isTyping?: boolean;
}

const DEMO_QUICK_ACTIONS = [
  "帮我构建学习画像",
  "生成线性回归学习资源",
  "制定一个月学习计划",
  "解释梯度下降算法",
];

const REAL_QUICK_ACTIONS = [
  "帮我构建学习画像",
  "我想开始学习一门课程",
  "制定我的学习计划",
  "解释一个我不太懂的概念",
];

// 单条消息 —— 用 memo 确保流式更新时仅重绘当前气泡
const MessageItem = memo(function MessageItem({
  msg,
  onResourceClick,
}: {
  msg: Message;
  onResourceClick?: (id: string) => void;
}) {
  return (
    <div className={`lp-chat-row lp-chat-row--${msg.role}`}>
      {msg.role === "assistant" && (
        <Avatar size={36} className="lp-chat-avatar lp-chat-avatar--ai" icon={<RobotOutlined />} />
      )}

      <div className="lp-chat-body">
        {msg.isTyping ? (
          <div className="lp-chat-bubble lp-chat-bubble--assistant lp-chat-bubble--typing">
            <span className="typing-dot" />
            <span className="typing-dot" />
            <span className="typing-dot" />
          </div>
        ) : (
          <>
            <div className={`lp-chat-bubble lp-chat-bubble--${msg.role}`}>
              <div className={`md-content ${msg.role === "user" ? "md-user" : ""}`}>
                <MarkdownPreview content={msg.content || "　"} />
              </div>
            </div>

            {msg.resources && msg.resources.length > 0 && (
              <div className="lp-chat-resources">
                {msg.resources.map((r, i) => {
                  const uiType = mapApiType(r.type);
                  const cfg = RESOURCE_CONFIG[uiType];
                  return (
                    <div
                      key={r.id || i}
                      role={r.id ? "button" : undefined}
                      tabIndex={r.id ? 0 : undefined}
                      className="resource-card lp-chat-resource-card"
                      style={{
                        borderColor: `${cfg.color}33`,
                        borderLeftColor: cfg.color,
                        cursor: r.id ? "pointer" : undefined,
                      }}
                      onClick={() => r.id && onResourceClick?.(r.id)}
                      onKeyDown={(e) => {
                        if (r.id && (e.key === "Enter" || e.key === " ")) {
                          e.preventDefault();
                          onResourceClick?.(r.id);
                        }
                      }}
                    >
                      <span style={{ color: cfg.color, fontSize: 16 }}>{cfg.icon}</span>
                      <div>
                        <div className="lp-chat-resource-type" style={{ color: cfg.color }}>
                          {cfg.label}
                        </div>
                        <div className="lp-chat-resource-title">{r.title}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className={`lp-chat-time lp-chat-time--${msg.role}`}>
              {msg.timestamp.toLocaleTimeString("zh-CN", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </div>
          </>
        )}
      </div>

      {msg.role === "user" && (
        <Avatar size={36} className="lp-chat-avatar lp-chat-avatar--user" icon={<UserOutlined />} />
      )}
    </div>
  );
});

const STAGE_LABELS: Record<string, string> = {
  deep_thinking: "深度思考中",
  profile: "同步画像",
  generate: "生成资源",
  path: "规划路径",
  eval: "学习评估",
  chat: "智能回答",
  tutor: "智能回答",
  retrieval: "检索资源库",
  running: "处理中",
};

const WELCOME_MSG: Message = {
  id: "0",
  role: "assistant",
  content: `你好！我是 **学径 LearnPath 学习助手** 🎓\n\n我可以帮你：\n- 📊 **构建个人学习画像** — 通过对话了解你的学习情况\n- 📚 **生成个性化学习资源** — 文档、思维导图、题库、多模态说明、代码案例\n- 🗺️ **规划学习路径** — 科学分阶段的个性化学习计划\n- 🤔 **智能答疑** — 优先检索你的资源库，润色后作答；可输出代码、视频分镜等多模态内容\n\n请告诉我你想学习什么，或点击下方快捷操作开始 👇`,
  timestamp: new Date(),
};

export default function ChatContent() {
  const userId = useAppStore((s) => s.userId);
  const quickActions = isDemoUser(userId) ? DEMO_QUICK_ACTIONS : REAL_QUICK_ACTIONS;
  const setProfile = useAppStore((s) => s.setProfile);
  const setResources = useAppStore((s) => s.setResources);
  const setResourceTitles = useAppStore((s) => s.setResourceTitles);
  const setLearningPath = useAppStore((s) => s.setLearningPath);
  const setEvalStats = useAppStore((s) => s.setEvalStats);
  const addResources = useAppStore((s) => s.addResources);
  const setPendingResourcePreviewId = useAppStore((s) => s.setPendingResourcePreviewId);
  const streamSpeed = useSettingsStore((s) => s.streamSpeed);
  const deepThinking = useSettingsStore((s) => s.deepThinking);
  const ttsEnabled = useSettingsStore((s) => s.ttsEnabled);
  const voice = useSettingsStore((s) => s.voice);
  const setSettings = useSettingsStore((s) => s.setSettings);
  const chunkSize = streamSpeed === "fast" ? 2 : 1;
  const [messages, setMessages] = useState<Message[]>([WELCOME_MSG]);
  const [recommendations, setRecommendations] = useState<ResourceRecommendation[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [backendOk, setBackendOk] = useState<boolean | null>(null);
  const [llmRouting, setLlmRouting] = useState("");
  const [stageLabel, setStageLabel] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const handleResourceClick = useCallback(
    (id: string) => {
      setPendingResourcePreviewId(id);
      clientNavigate("/resources");
    },
    [setPendingResourcePreviewId]
  );

  const syncAfterChat = useCallback(async () => {
    try {
      const [list, p, evalS, pathData] = await Promise.all([
        listResources(userId),
        getProfile(userId),
        getEvalStats(userId),
        getPath(userId),
      ]);
      setResources(list);
      const titles: Record<string, string> = {};
      list.forEach((r) => {
        titles[r.id] = r.title;
      });
      setResourceTitles(titles);
      if (p) setProfile(p);
      setEvalStats(evalS);
      if (pathData) setLearningPath(pathData);
    } catch {
      /* 部分接口可能尚未就绪 */
    }
  }, [userId, setResources, setResourceTitles, setProfile, setEvalStats, setLearningPath]);

  const probeBackend = useCallback(async () => {
    const data = await getHealth();
    if (data) {
      setBackendOk(data.status === "ok");
      setLlmRouting(formatLlmRouting(data.llm?.routing));
      return;
    }
    setBackendOk(await checkHealth());
    setLlmRouting("");
  }, []);

  useEffect(() => {
    void probeBackend();
    const timer = setInterval(() => void probeBackend(), 15000);
    return () => clearInterval(timer);
  }, [probeBackend]);

  useEffect(() => {
    setMessages([WELCOME_MSG]);
    let cancelled = false;
    void getChatHistory(userId)
      .then((rows) => {
        if (cancelled || !rows.length) return;
        setMessages([
          WELCOME_MSG,
          ...rows.map((r) => ({
            id: r.id,
            role: r.role,
            content: r.content,
            resources: r.resources?.length ? r.resources : undefined,
            timestamp: new Date(r.created_at),
          })),
        ]);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    void getRecommendations(userId, 3)
      .then(setRecommendations)
      .catch(() => setRecommendations([]));
  }, [userId]);

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
      void appendChatHistory(userId, "user", content).catch(() => {});
      setLoading(true);

      const typingId = "typing";
      setMessages((prev) => [
        ...prev,
        { id: typingId, role: "assistant", content: "", isTyping: true, timestamp: new Date() },
      ]);

      try {
        let acc = "";
        let finalReply = "";
        let msgResources: ResourceSummary[] | undefined;
        let replyId: string | null = null;

        const formatStage = (stage: string) => STAGE_LABELS[stage] || stage;

        const ensureAssistantMessage = (content: string) => {
          if (!replyId) {
            replyId = (Date.now() + 1).toString();
            setMessages((prev) =>
              prev
                .filter((m) => m.id !== typingId)
                .concat({
                  id: replyId!,
                  role: "assistant",
                  content,
                  timestamp: new Date(),
                })
            );
            return;
          }
          setMessages((prev) =>
            prev.map((m) => (m.id === replyId ? { ...m, content } : m))
          );
        };

        const callbacks = {
          onToken: (token: string) => {
            acc += token;
            ensureAssistantMessage(acc);
          },
          onProgress: (stage: string) => setStageLabel(formatStage(stage)),
          onDone: (reply: string) => {
            finalReply = reply;
            if (reply && reply !== acc) {
              acc = reply;
              ensureAssistantMessage(acc);
            }
          },
          onError: (err: string) => {
            throw new Error(err);
          },
        };

        await streamChat(
          userId,
          content,
          {
            ...callbacks,
            onIntent: (intent: string) => setStageLabel(formatStage(intent)),
            onProfile: (p) => setProfile(p),
            onResources: (items) => {
              msgResources = items;
              addResources(
                items.map((it) => ({
                  id: it.id,
                  type: it.type,
                  title: it.title,
                  content: "",
                  sources: [],
                  topic: "",
                }))
              );
            },
            onPath: () => setStageLabel(formatStage("path")),
          },
          chunkSize,
          deepThinking
        );

        const assistantText = (finalReply || acc).trim();
        if (!assistantText) {
          setMessages((prev) =>
            prev
              .filter((m) => m.id !== typingId)
              .concat({
                id: (Date.now() + 1).toString(),
                role: "assistant",
                content: "暂时无法获取回复，请检查后端连接后重试。",
                timestamp: new Date(),
              })
          );
        } else if (msgResources?.length && replyId) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === replyId ? { ...m, resources: msgResources } : m
            )
          );
        }

        if (assistantText) {
          void appendChatHistory(userId, "assistant", assistantText, msgResources || []).catch(
            () => {}
          );
          if (ttsEnabled) {
            void playAssistantSpeech(assistantText, voice);
          }
        }

        setStageLabel("");
        await syncAfterChat();
        void getRecommendations(userId, 3)
          .then(setRecommendations)
          .catch(() => {});
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "未知错误";
        setMessages((prev) =>
          prev
            .filter((m) => m.id !== typingId)
            .concat({
              id: Date.now().toString(),
              role: "assistant",
              content: `⚠️ 连接失败：${msg}\n\n请双击项目根目录 **打开学径.bat** 重新启动（会等待后端就绪后再打开页面）。\n若已启动，请查看标题为「LearnPath Backend」的命令行窗口是否有报错。`,
              timestamp: new Date(),
            })
        );
      } finally {
        setLoading(false);
      }
    },
    [
      input,
      loading,
      userId,
      setProfile,
      chunkSize,
      deepThinking,
      addResources,
      syncAfterChat,
      ttsEnabled,
      voice,
    ]
  );

  const statusClass =
    backendOk === false
      ? "lp-status-dot--err"
      : backendOk
        ? "lp-status-dot--ok"
        : "lp-status-dot--idle";

  return (
    <div className="lp-chat-page">
      <PageHeader
        title="智能学习助手"
        subtitle="多智能体协同 · RAG 知识增强"
        variant="immersive"
        icon={<RobotOutlined />}
        status={
          <span className={`lp-status-dot ${statusClass}`}>
            {stageLabel
              ? `处理中 · ${stageLabel}`
              : backendOk === false
                ? "后端未连接 · 请运行 打开学径.bat"
                : backendOk
                  ? `在线 · ${llmRouting || "LLM"}${deepThinking ? " · 深度思考" : ""}`
                  : "检测连接中…"}
          </span>
        }
        extra={
          <Tooltip title="清空对话">
            <Button
              icon={<ReloadOutlined />}
              size="small"
              onClick={() => {
                historyLoaded.current = true;
                setMessages([{ ...WELCOME_MSG, content: "对话已清空，请重新开始 👋" }]);
              }}
            />
          </Tooltip>
        }
      />

      {recommendations.length > 0 && (
        <div className="lp-chat-recommendations">
          <span className="lp-muted-text" style={{ fontSize: 12, marginRight: 8 }}>
            今日推荐
          </span>
          {recommendations.map((rec) => (
            <Tag
              key={rec.id}
              className="lp-quick-tag"
              color="processing"
              onClick={() => handleResourceClick(rec.id)}
            >
              {rec.title}
            </Tag>
          ))}
        </div>
      )}

      <div className="lp-chat-messages">
        {messages.map((msg) => (
          <MessageItem key={msg.id} msg={msg} onResourceClick={handleResourceClick} />
        ))}
        <div ref={bottomRef} />
      </div>

      {messages.length <= 1 && (
        <div className="lp-chat-quick-actions">
          {quickActions.map((a) => (
            <Tag
              key={a}
              color="blue"
              className="lp-quick-tag"
              onClick={() => send(a)}
            >
              {a}
            </Tag>
          ))}
        </div>
      )}

      <div className="lp-chat-composer-wrap">
        <div className="lp-chat-composer-toolbar">
          <Tooltip title="开启后推理更完整，响应略慢">
            <Switch
              size="small"
              checked={deepThinking}
              onChange={(v) => setSettings({ deepThinking: v })}
              checkedChildren={<BulbOutlined />}
              unCheckedChildren={<BulbOutlined />}
            />
          </Tooltip>
          <span className="lp-muted-text" style={{ fontSize: 12 }}>
            深度思考
          </span>
        </div>
        <div className="lp-chat-composer">
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
          style={{ borderRadius: 10, fontSize: 14, resize: "none", flex: 1 }}
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
    </div>
  );
}
