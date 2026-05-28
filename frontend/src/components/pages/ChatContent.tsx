"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Input, Button, Avatar, Tag, Tooltip, Switch, Upload, message, Modal } from "antd";
import SendOutlined from "@ant-design/icons/SendOutlined";
import BulbOutlined from "@ant-design/icons/BulbOutlined";
import GlobalOutlined from "@ant-design/icons/GlobalOutlined";
import PaperClipOutlined from "@ant-design/icons/PaperClipOutlined";
import UserOutlined from "@ant-design/icons/UserOutlined";
import RobotOutlined from "@ant-design/icons/RobotOutlined";
import ReloadOutlined from "@ant-design/icons/ReloadOutlined";
import DeleteOutlined from "@ant-design/icons/DeleteOutlined";
import CopyOutlined from "@ant-design/icons/CopyOutlined";
import PageHeader from "@/components/PageHeader";
import MarkdownPreview from "@/components/MarkdownPreview";
import ChatHistorySidebar from "@/components/ChatHistorySidebar";
import {
  appendChatHistory,
  checkHealth,
  clearChatHistory,
  createChatConversation,
  deleteChatConversation,
  deleteAssistantForTurn,
  deleteChatTurn,
  formatLlmRouting,
  getHealth,
  getChatHistory,
  getChatConversations,
  getEvalStats,
  getPath,
  getProfile,
  getRecommendations,
  listResources,
  streamChat,
  uploadChatAttachments,
  type ChatAttachment,
  type ChatConversationSummary,
  type ResourceRecommendation,
  type ResourceSummary,
} from "@/lib/api";
import { apiUrl } from "@/lib/apiBase";
import {
  buildAttachmentContext,
  groupConversationsByDate,
} from "@/lib/chatHistoryUtils";
import { copyTextToClipboard, isFailedAssistantReply } from "@/lib/chatMessageUtils";
import { RESOURCE_CONFIG, mapApiType } from "@/lib/resourceConfig";
import { playAssistantSpeech } from "@/lib/tts";
import { isDemoUser, useAppStore } from "@/store/appStore";
import { useSettingsStore } from "@/store/settingsStore";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  resources?: ResourceSummary[];
  attachments?: ChatAttachment[];
  turnId?: string;
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

const MessageItem = memo(function MessageItem({
  msg,
  onResourceClick,
  onDeleteTurn,
  onCopy,
  showRegenerate,
  onRegenerate,
  regenerating,
  registerRef,
}: {
  msg: Message;
  onResourceClick?: (id: string) => void;
  onDeleteTurn?: (userMessageId: string) => void;
  onCopy?: (content: string) => void;
  showRegenerate?: boolean;
  onRegenerate?: () => void;
  regenerating?: boolean;
  registerRef?: (id: string, el: HTMLDivElement | null) => void;
}) {
  return (
    <div
      ref={(el) => registerRef?.(msg.id, el)}
      className={`lp-chat-row lp-chat-row--${msg.role}`}
    >
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
              {msg.attachments && msg.attachments.length > 0 && (
                <div className="lp-chat-attachments">
                  {msg.attachments.map((att) =>
                    att.kind === "image" ? (
                      <a
                        key={att.id}
                        href={apiUrl(att.url)}
                        target="_blank"
                        rel="noreferrer"
                        className="lp-chat-attachment-image-wrap"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={apiUrl(att.url)}
                          alt={att.name}
                          className="lp-chat-attachment-image"
                        />
                      </a>
                    ) : (
                      <Tag key={att.id} className="lp-chat-attachment-file">
                        📎 {att.name}
                      </Tag>
                    )
                  )}
                </div>
              )}
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
              <span className="lp-chat-time-text">
                {msg.timestamp.toLocaleTimeString("zh-CN", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              <span className="lp-chat-actions">
                {onCopy && (
                  <Tooltip title="复制内容">
                    <Button
                      type="text"
                      size="small"
                      className="lp-chat-action-btn"
                      icon={<CopyOutlined />}
                      onClick={() => onCopy(msg.content)}
                    />
                  </Tooltip>
                )}
                {msg.role === "user" && onDeleteTurn && (
                  <Tooltip title="删除本轮对话（含回答）">
                    <Button
                      type="text"
                      size="small"
                      danger
                      className="lp-chat-action-btn lp-chat-delete-turn"
                      icon={<DeleteOutlined />}
                      onClick={() => onDeleteTurn(msg.id)}
                    />
                  </Tooltip>
                )}
              </span>
            </div>

            {msg.role === "user" && showRegenerate && onRegenerate && (
              <div className="lp-chat-regenerate-wrap">
                <Button
                  type="link"
                  size="small"
                  icon={<ReloadOutlined />}
                  loading={regenerating}
                  disabled={regenerating}
                  className="lp-chat-regenerate-btn"
                  onClick={onRegenerate}
                >
                  重新生成回答
                </Button>
              </div>
            )}
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
  web_research: "联网检索中",
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
  id: "welcome",
  role: "assistant",
  content: `你好！我是 **学径 LearnPath 学习助手** 🎓\n\n我可以帮你：\n- 📊 **构建个人学习画像** — 通过对话了解你的学习情况\n- 📚 **生成个性化学习资源** — 文档、思维导图、题库、多模态说明、代码案例\n- 🗺️ **规划学习路径** — 科学分阶段的个性化学习计划\n- 🤔 **智能答疑** — 优先检索你的资源库；可开启 **联网思考** 补充最新资料\n- 📎 **上传图片与文档** — 课件、截图可随问题一并分析\n\n请告诉我你想学习什么，或从左侧目录回顾历史对话 👇`,
  timestamp: new Date(),
};

function rowsToMessages(rows: Awaited<ReturnType<typeof getChatHistory>>): Message[] {
  return rows.map((r) => ({
    id: r.id,
    role: r.role,
    content: r.content,
    resources: r.resources?.length ? r.resources : undefined,
    attachments: r.attachments?.length ? r.attachments : undefined,
    turnId: r.turn_id,
    timestamp: new Date(r.created_at),
  }));
}

export default function ChatContent() {
  const router = useRouter();
  const userId = useAppStore((s) => s.userId);
  const quickActions = isDemoUser(userId) ? DEMO_QUICK_ACTIONS : REAL_QUICK_ACTIONS;
  const setProfile = useAppStore((s) => s.setProfile);
  const setResources = useAppStore((s) => s.setResources);
  const setResourceTitles = useAppStore((s) => s.setResourceTitles);
  const setLearningPath = useAppStore((s) => s.setLearningPath);
  const setEvalStats = useAppStore((s) => s.setEvalStats);
  const addResources = useAppStore((s) => s.addResources);

  const streamSpeed = useSettingsStore((s) => s.streamSpeed);
  const deepThinking = useSettingsStore((s) => s.deepThinking);
  const webSearch = useSettingsStore((s) => s.webSearch);
  const ttsEnabled = useSettingsStore((s) => s.ttsEnabled);
  const voice = useSettingsStore((s) => s.voice);
  const setSettings = useSettingsStore((s) => s.setSettings);
  const chunkSize = streamSpeed === "fast" ? 2 : 1;

  const [messages, setMessages] = useState<Message[]>([WELCOME_MSG]);
  const [historyRows, setHistoryRows] = useState<Awaited<ReturnType<typeof getChatHistory>>>([]);
  const [conversations, setConversations] = useState<ChatConversationSummary[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [recommendations, setRecommendations] = useState<ResourceRecommendation[]>([]);
  const [input, setInput] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<ChatAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [backendOk, setBackendOk] = useState<boolean | null>(null);
  const [llmRouting, setLlmRouting] = useState("");
  const [stageLabel, setStageLabel] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeUserMessageId, setActiveUserMessageId] = useState<string | null>(null);
  const [regeneratingUserId, setRegeneratingUserId] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const conversationGroups = useMemo(
    () => groupConversationsByDate(conversations),
    [conversations]
  );

  const regenerateUserIds = useMemo(() => {
    const ids = new Set<string>();
    const list = messages.filter((m) => m.id !== "welcome" && !m.isTyping);
    for (let i = 0; i < list.length; i++) {
      if (list[i].role !== "user") continue;
      const user = list[i];
      let assistant: Message | undefined;
      for (let j = i + 1; j < list.length; j++) {
        if (list[j].role === "user") break;
        if (list[j].role === "assistant") assistant = list[j];
      }
      if (!assistant || isFailedAssistantReply(assistant.content)) {
        ids.add(user.id);
      }
    }
    return ids;
  }, [messages]);

  const handleCopyMessage = useCallback(async (content: string) => {
    const ok = await copyTextToClipboard(content);
    if (ok) message.success("已复制到剪贴板");
    else message.warning("复制失败，请手动选择文本");
  }, []);

  const registerMessageRef = useCallback((id: string, el: HTMLDivElement | null) => {
    messageRefs.current[id] = el;
  }, []);

  const scrollToMessage = useCallback((userMessageId: string) => {
    setActiveUserMessageId(userMessageId);
    const el = messageRefs.current[userMessageId];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, []);

  const reloadConversations = useCallback(async () => {
    try {
      const list = await getChatConversations(userId);
      setConversations(list);
      return list;
    } catch {
      return [] as ChatConversationSummary[];
    }
  }, [userId]);

  const loadConversationMessages = useCallback(async (conversationId: string) => {
    try {
      const rows = await getChatHistory(userId, conversationId);
      setHistoryRows(rows);
      setMessages(rows.length ? [WELCOME_MSG, ...rowsToMessages(rows)] : [WELCOME_MSG]);
    } catch {
      setHistoryRows([]);
      setMessages([WELCOME_MSG]);
    }
  }, [userId]);

  const reloadHistory = useCallback(async () => {
    if (!activeConversationId) {
      setHistoryRows([]);
      return;
    }
    await loadConversationMessages(activeConversationId);
    await reloadConversations();
  }, [activeConversationId, loadConversationMessages, reloadConversations]);

  const handleResourceClick = useCallback(
    (id: string) => {
      router.push(`/resources/view/${encodeURIComponent(id)}`);
    },
    [router]
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
      /* ignore */
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
    setHistoryRows([]);
    setConversations([]);
    setActiveConversationId(null);
    setActiveUserMessageId(null);
    let cancelled = false;
    void reloadConversations().then((list) => {
      if (cancelled || !list.length) return;
      const first = list[0].id;
      setActiveConversationId(first);
      void loadConversationMessages(first);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, reloadConversations, loadConversationMessages]);

  useEffect(() => {
    void getRecommendations(userId, 3)
      .then(setRecommendations)
      .catch(() => setRecommendations([]));
  }, [userId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const removeTurnFromUi = useCallback((userMessageId: string) => {
    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === userMessageId && m.role === "user");
      if (idx < 0) return prev;
      const turnId = prev[idx].turnId;
      const next = [...prev];
      let end = idx + 1;
      if (turnId) {
        while (end < next.length && next[end].turnId === turnId) end += 1;
      } else if (end < next.length && next[end].role === "assistant") {
        end += 1;
      }
      next.splice(idx, end - idx);
      return next.length ? next : [WELCOME_MSG];
    });
    void reloadHistory();
  }, [reloadHistory]);

  const handleDeleteTurn = useCallback(
    (userMessageId: string) => {
      if (userMessageId === "welcome") return;
      Modal.confirm({
        title: "删除这轮对话？",
        content: "将同时删除你的提问与助手回答，且不可恢复。",
        okText: "删除",
        okType: "danger",
        onOk: async () => {
          try {
            await deleteChatTurn(userId, userMessageId);
            removeTurnFromUi(userMessageId);
            await reloadHistory();
            if (activeUserMessageId === userMessageId) setActiveUserMessageId(null);
            message.success("已删除");
          } catch (e: unknown) {
            message.error(e instanceof Error ? e.message : "删除失败");
          }
        },
      });
    },
    [userId, removeTurnFromUi, reloadHistory, activeUserMessageId]
  );

  const handleNewConversation = useCallback(() => {
    setActiveConversationId(null);
    setActiveUserMessageId(null);
    setHistoryRows([]);
    setMessages([WELCOME_MSG]);
  }, []);

  const handleSelectConversation = useCallback(
    async (conversationId: string) => {
      if (conversationId === activeConversationId) return;
      setActiveConversationId(conversationId);
      setActiveUserMessageId(null);
      await loadConversationMessages(conversationId);
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    },
    [activeConversationId, loadConversationMessages]
  );

  const handleDeleteConversation = useCallback(
    (conversationId: string) => {
      Modal.confirm({
        title: "删除该对话？",
        content: "将删除此对话中的全部消息，且不可恢复。",
        okText: "删除",
        okType: "danger",
        onOk: async () => {
          try {
            await deleteChatConversation(userId, conversationId);
            const list = await reloadConversations();
            if (activeConversationId === conversationId) {
              if (list.length) {
                const nextId = list[0].id;
                setActiveConversationId(nextId);
                await loadConversationMessages(nextId);
              } else {
                setActiveConversationId(null);
                setHistoryRows([]);
                setMessages([WELCOME_MSG]);
              }
            }
            message.success("已删除");
          } catch (e: unknown) {
            message.error(e instanceof Error ? e.message : "删除失败");
          }
        },
      });
    },
    [userId, activeConversationId, reloadConversations, loadConversationMessages]
  );

  const handleClearChat = useCallback(() => {
    if (!activeConversationId) {
      message.info("当前没有可清空的对话");
      return;
    }
    Modal.confirm({
      title: "清空当前对话？",
      okType: "danger",
      onOk: async () => {
        try {
          await clearChatHistory(userId, activeConversationId);
          setHistoryRows([]);
          setMessages([{ ...WELCOME_MSG, content: "对话已清空，请重新开始 👋" }]);
          setActiveUserMessageId(null);
          setActiveConversationId(null);
          await reloadConversations();
          message.success("已清空");
        } catch (e: unknown) {
          message.error(e instanceof Error ? e.message : "清空失败");
        }
      },
    });
  }, [userId, activeConversationId, reloadConversations]);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const list = await uploadChatAttachments(userId, [file]);
      setPendingAttachments((prev) => [...prev, ...list]);
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "上传失败");
    } finally {
      setUploading(false);
    }
    return false;
  };

  const runAssistantReply = useCallback(
    async (params: {
      displayContent: string;
      turnId: string;
      conversationId: string;
      attachmentContext: string;
    }) => {
      const { displayContent, turnId, conversationId, attachmentContext } = params;
      setLoading(true);
      const typingId = "typing";
      setMessages((prev) => [
        ...prev,
        { id: typingId, role: "assistant", content: "", isTyping: true, timestamp: new Date() },
      ]);

      let acc = "";
      let finalReply = "";
      let msgResources: ResourceSummary[] | undefined;
      let replyId: string | null = null;

      const formatStage = (stage: string) => STAGE_LABELS[stage] || stage;

      const ensureAssistantMessage = (replyContent: string) => {
        if (!replyId) {
          replyId = `local-a-${Date.now()}`;
          setMessages((prev) =>
            prev
              .filter((m) => m.id !== typingId)
              .concat({
                id: replyId!,
                role: "assistant",
                content: replyContent,
                turnId,
                timestamp: new Date(),
              })
          );
          return;
        }
        setMessages((prev) =>
          prev.map((m) => (m.id === replyId ? { ...m, content: replyContent } : m))
        );
      };

      try {
        await streamChat(
          userId,
          displayContent,
          {
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
              const text = err.startsWith("⚠️") ? err : `⚠️ ${err}`;
              finalReply = text;
              ensureAssistantMessage(text);
            },
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
          deepThinking,
          webSearch,
          attachmentContext
        );

        const assistantText = (finalReply || acc).trim();
        if (!assistantText) {
          setMessages((prev) =>
            prev
              .filter((m) => m.id !== typingId)
              .concat({
                id: `local-a-${Date.now()}`,
                role: "assistant",
                content:
                  "暂时无法获取回复。请先运行 **stop.bat** 再 **start.bat** 重启服务。",
                turnId,
                timestamp: new Date(),
              })
          );
        } else if (msgResources?.length && replyId) {
          setMessages((prev) =>
            prev.map((m) => (m.id === replyId ? { ...m, resources: msgResources } : m))
          );
        }

        const textToSave = (finalReply || acc).trim() || "";
        if (textToSave) {
          const savedAsst = await appendChatHistory(
            userId,
            "assistant",
            textToSave,
            msgResources || [],
            { turnId, conversationId }
          ).catch(() => null);
          if (savedAsst) {
            setHistoryRows((prev) => [...prev, savedAsst]);
            if (replyId) {
              setMessages((prev) =>
                prev.map((m) => (m.id === replyId ? { ...m, id: savedAsst.id } : m))
              );
            }
          }
          if (ttsEnabled && !isFailedAssistantReply(textToSave)) {
            void playAssistantSpeech(textToSave, voice);
          }
        }

        setStageLabel("");
        await syncAfterChat();
        void getRecommendations(userId, 3)
          .then(setRecommendations)
          .catch(() => {});
      } catch (err: unknown) {
        const msgText = err instanceof Error ? err.message : "未知错误";
        const errContent = `⚠️ ${msgText}\n\n若持续出现，请运行 **stop.bat** 再 **start.bat** 重启服务，或检查 .env 中 Kimi API 配置。`;
        setMessages((prev) => {
          const withoutTyping = prev.filter((m) => m.id !== typingId);
          if (replyId) {
            return withoutTyping.map((m) =>
              m.id === replyId ? { ...m, content: errContent } : m
            );
          }
          return withoutTyping.concat({
            id: `local-a-err-${Date.now()}`,
            role: "assistant",
            content: errContent,
            turnId,
            timestamp: new Date(),
          });
        });
        await appendChatHistory(userId, "assistant", errContent, [], {
          turnId,
          conversationId,
        }).catch(() => null);
      } finally {
        setLoading(false);
        setMessages((prev) => prev.filter((m) => m.id !== typingId));
        void reloadConversations();
      }
    },
    [
      userId,
      setProfile,
      chunkSize,
      deepThinking,
      webSearch,
      addResources,
      syncAfterChat,
      ttsEnabled,
      voice,
      reloadHistory,
      reloadConversations,
    ]
  );

  const handleRegenerate = useCallback(
    async (userMessageId: string) => {
      if (loading || regeneratingUserId) return;
      const userMsg = messages.find((m) => m.id === userMessageId && m.role === "user");
      if (!userMsg || userMsg.id === "welcome") return;

      let conversationId = activeConversationId;
      if (!conversationId) {
        message.warning("请先选择或创建对话");
        return;
      }

      setRegeneratingUserId(userMessageId);
      const turnId = userMsg.turnId || crypto.randomUUID().replace(/-/g, "").slice(0, 16);

      setMessages((prev) =>
        prev.filter(
          (m) =>
            !m.isTyping &&
            !(m.role === "assistant" && m.turnId === turnId && m.id !== "welcome")
        )
      );

      try {
        await deleteAssistantForTurn(userId, userMessageId).catch(() => null);
        await runAssistantReply({
          displayContent: userMsg.content,
          turnId,
          conversationId,
          attachmentContext: buildAttachmentContext(userMsg.attachments || []),
        });
      } catch (e: unknown) {
        message.error(e instanceof Error ? e.message : "重新生成失败");
      } finally {
        setRegeneratingUserId(null);
      }
    },
    [
      loading,
      regeneratingUserId,
      messages,
      activeConversationId,
      userId,
      runAssistantReply,
    ]
  );

  const send = useCallback(
    async (text?: string) => {
      const content = (text ?? input).trim();
      if ((!content && !pendingAttachments.length) || loading) return;
      setInput("");

      const turnId = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
      const attachments = [...pendingAttachments];
      setPendingAttachments([]);

      const displayContent =
        content ||
        (attachments.length
          ? `（${attachments.map((a) => a.name).join("、")}）`
          : "");

      let conversationId = activeConversationId;
      if (!conversationId) {
        try {
          const conv = await createChatConversation(userId);
          conversationId = conv.id;
          setActiveConversationId(conv.id);
          await reloadConversations();
        } catch (e: unknown) {
          message.error(e instanceof Error ? e.message : "无法创建对话");
          return;
        }
      }

      const localUserId = `local-u-${Date.now()}`;
      const userMsg: Message = {
        id: localUserId,
        role: "user",
        content: displayContent,
        attachments: attachments.length ? attachments : undefined,
        turnId,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setActiveUserMessageId(localUserId);

      const savedUser = await appendChatHistory(userId, "user", displayContent, [], {
        turnId,
        attachments,
        conversationId: conversationId!,
      }).catch(() => null);
      if (savedUser) {
        setMessages((prev) =>
          prev.map((m) => (m.id === localUserId ? { ...m, id: savedUser.id } : m))
        );
        setActiveUserMessageId(savedUser.id);
        setHistoryRows((prev) => [...prev, savedUser]);
      }

      await runAssistantReply({
        displayContent,
        turnId,
        conversationId: conversationId!,
        attachmentContext: buildAttachmentContext(attachments),
      });
    },
    [
      input,
      loading,
      userId,
      pendingAttachments,
      activeConversationId,
      reloadConversations,
      runAssistantReply,
    ]
  );

  const statusClass =
    backendOk === false
      ? "lp-status-dot--err"
      : backendOk
        ? "lp-status-dot--ok"
        : "lp-status-dot--idle";

  const statusText = stageLabel
    ? `处理中 · ${stageLabel}`
    : backendOk === false
      ? "后端未连接 · 请运行 start.bat"
      : backendOk
        ? `在线 · ${llmRouting || "LLM"}${deepThinking ? " · 深度思考" : ""}${webSearch ? " · 联网" : ""}`
        : "检测连接中…";

  return (
    <div className="lp-chat-page">
      <PageHeader
        title="智能学习助手"
        subtitle="多智能体协同 · RAG 知识增强"
        variant="immersive"
        icon={<RobotOutlined />}
        status={<span className={`lp-status-dot ${statusClass}`}>{statusText}</span>}
        extra={
          <Tooltip title="清空当前对话">
            <Button icon={<ReloadOutlined />} size="small" onClick={handleClearChat} />
          </Tooltip>
        }
      />

      <div className="lp-chat-main">
        <ChatHistorySidebar
          groups={conversationGroups}
          activeConversationId={activeConversationId}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
          onSelectConversation={handleSelectConversation}
          onDeleteConversation={handleDeleteConversation}
          onNewChat={() => void handleNewConversation()}
        />

        <div className="lp-chat-column">
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
              <MessageItem
                key={msg.id}
                msg={msg}
                onResourceClick={handleResourceClick}
                onDeleteTurn={msg.role === "user" && msg.id !== "welcome" ? handleDeleteTurn : undefined}
                onCopy={
                  !msg.isTyping && msg.id !== "welcome"
                    ? handleCopyMessage
                    : undefined
                }
                showRegenerate={
                  msg.role === "user" &&
                  msg.id !== "welcome" &&
                  regenerateUserIds.has(msg.id) &&
                  !loading
                }
                onRegenerate={
                  msg.role === "user" && regenerateUserIds.has(msg.id)
                    ? () => void handleRegenerate(msg.id)
                    : undefined
                }
                regenerating={regeneratingUserId === msg.id}
                registerRef={registerMessageRef}
              />
            ))}
            <div ref={bottomRef} />
          </div>

          {messages.length <= 1 && (
            <div className="lp-chat-quick-actions">
              {quickActions.map((a) => (
                <Tag key={a} color="blue" className="lp-quick-tag" onClick={() => send(a)}>
                  {a}
                </Tag>
              ))}
            </div>
          )}

          <div className="lp-chat-composer-wrap">
            {pendingAttachments.length > 0 && (
              <div className="lp-chat-pending-attachments">
                {pendingAttachments.map((att) => (
                  <Tag
                    key={att.id}
                    closable
                    onClose={() =>
                      setPendingAttachments((prev) => prev.filter((x) => x.id !== att.id))
                    }
                  >
                    {att.kind === "image" ? "🖼" : "📎"} {att.name}
                  </Tag>
                ))}
              </div>
            )}
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
              <Tooltip title="结合全网检索补充最新资料（响应较慢）">
                <Switch
                  size="small"
                  checked={webSearch}
                  onChange={(v) => setSettings({ webSearch: v })}
                  checkedChildren={<GlobalOutlined />}
                  unCheckedChildren={<GlobalOutlined />}
                />
              </Tooltip>
              <span className="lp-muted-text" style={{ fontSize: 12 }}>
                联网思考
              </span>
              <Upload
                multiple
                showUploadList={false}
                beforeUpload={handleUpload}
                accept="image/*,.pdf,.doc,.docx,.md,.txt,.ppt,.pptx"
              >
                <Button
                  type="text"
                  size="small"
                  icon={<PaperClipOutlined />}
                  loading={uploading}
                >
                  上传
                </Button>
              </Upload>
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
                placeholder="输入消息，或上传图片/文档后发送"
                autoSize={{ minRows: 1, maxRows: 5 }}
                style={{ borderRadius: 10, fontSize: 14, resize: "none", flex: 1 }}
                disabled={loading}
              />
              <Button
                type="primary"
                icon={<SendOutlined />}
                onClick={() => send()}
                loading={loading}
                disabled={!input.trim() && !pendingAttachments.length}
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
      </div>
    </div>
  );
}
