"use client";

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useRouter } from "next/navigation";
import { Input, Button, Avatar, Tag, Tooltip, Switch, Upload, message, Modal, Space } from "antd";
import SendOutlined from "@ant-design/icons/SendOutlined";
import BulbOutlined from "@ant-design/icons/BulbOutlined";
import GlobalOutlined from "@ant-design/icons/GlobalOutlined";
import PaperClipOutlined from "@ant-design/icons/PaperClipOutlined";
import UserOutlined from "@ant-design/icons/UserOutlined";
import RobotOutlined from "@ant-design/icons/RobotOutlined";
import ReloadOutlined from "@ant-design/icons/ReloadOutlined";
import HistoryOutlined from "@ant-design/icons/HistoryOutlined";
import PlusOutlined from "@ant-design/icons/PlusOutlined";
import DeleteOutlined from "@ant-design/icons/DeleteOutlined";
import CopyOutlined from "@ant-design/icons/CopyOutlined";
import { usePageActive } from "@/contexts/PageVisibilityContext";
import { loadActiveChatConversation, persistActiveChatConversation } from "@/lib/chatActive";
import PageHeader from "@/components/PageHeader";
import MarkdownPreview from "@/components/MarkdownPreview";
import StreamingMarkdown from "@/components/StreamingMarkdown";
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
  groupConversationsByDate,
} from "@/lib/chatHistoryUtils";
import { DEMO_DATA_CHANGED_EVENT } from "@/lib/demoDataSync";
import { copyTextToClipboard, isFailedAssistantReply } from "@/lib/chatMessageUtils";
import { RESOURCE_CONFIG, mapApiType } from "@/lib/resourceConfig";
import { playAssistantSpeech } from "@/lib/tts";
import { getStreamSpeedConfig } from "@/lib/streamSpeed";
import { isDemoUser, useAppStore } from "@/store/appStore";
import { useSettingsStore } from "@/store/settingsStore";
import { useSupportedUploadFormats } from "@/hooks/useSupportedUploadFormats";
import {
  buildUploadAccept,
  isAllowedUploadFile,
} from "@/lib/uploadFormats";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  resources?: ResourceSummary[];
  attachments?: ChatAttachment[];
  turnId?: string;
  timestamp: Date;
  isTyping?: boolean;
  isStreaming?: boolean;
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
  liveStreamText,
  thinkingLabel,
  onResourceClick,
  onDeleteTurn,
  onCopy,
  showRegenerate,
  onRegenerate,
  regenerating,
  registerRef,
}: {
  msg: Message;
  /** 流式进行中：与 msg.id 匹配时传入实时文本 */
  liveStreamText?: string;
  thinkingLabel?: string;
  onResourceClick?: (id: string) => void;
  onDeleteTurn?: (userMessageId: string) => void;
  onCopy?: (content: string) => void;
  showRegenerate?: boolean;
  onRegenerate?: () => void;
  regenerating?: boolean;
  registerRef?: (id: string, el: HTMLDivElement | null) => void;
}) {
  const displayCopyText =
    msg.isStreaming && liveStreamText !== undefined
      ? liveStreamText || msg.content
      : msg.content;
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
            <div className="lp-chat-thinking">
              <span className="lp-chat-thinking-dots" aria-hidden>
                <span className="typing-dot" />
                <span className="typing-dot" />
                <span className="typing-dot" />
              </span>
              <span className="lp-chat-thinking-text">
                {thinkingLabel || "正在理解你的问题"}
              </span>
            </div>
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
                {msg.isStreaming ? (
                  <StreamingMarkdown
                    text={liveStreamText ?? msg.content}
                    finished={false}
                  />
                ) : (
                  <MarkdownPreview content={msg.content || "　"} variant="chat" />
                )}
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
                      onClick={() => onCopy(displayCopyText)}
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
  fast_reply: "快速回答中",
  fast_resource: "快速生成中",
  web_research: "联网检索中",
  profile: "同步画像",
  generate: "生成资源",
  path: "规划路径",
  eval: "学习评估",
  chat: "智能回答",
  tutor: "智能回答",
  retrieval: "检索资源库",
  running: "处理中",
  vision_analysis: "分析图片中",
};

const WAIT_STAGE_LABELS: Record<string, string> = {
  vision_analysis: "正在分析你上传的内容",
  deep_thinking: "正在深入分析问题",
  fast_reply: "正在理解你的问题",
  web_research: "正在检索外部资料",
  realtime_state: "正在结合实时画像",
  profile: "正在同步学习画像",
  generate: "正在生成学习资源",
  path: "正在规划学习路径",
  eval: "正在整理评估结果",
  chat: "正在组织回答",
  tutor: "正在组织回答",
  retrieval: "正在检索你的资料库",
  running: "正在处理请求",
};

const WELCOME_MSG: Message = {
  id: "welcome",
  role: "assistant",
  content:
    "你好，我是学径学习助手。\n\n" +
    "你可以直接从一个很小的学习动作开始：\n\n" +
    "1. **问一个卡点**：例如“为什么梯度下降要沿负梯度方向走？”\n" +
    "2. **生成一组资源**：例如“给我一份线性回归讲解和 5 道练习”。\n" +
    "3. **安排下一步**：例如“我今晚有 40 分钟，帮我规划学习任务”。\n\n" +
    "如果你还没想好怎么描述，就告诉我“正在学什么 + 哪里不懂”，我会继续追问并补全学习画像。",
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
  const pageActive = usePageActive();
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
  const streamConfig = useMemo(
    () => getStreamSpeedConfig(streamSpeed, deepThinking),
    [streamSpeed, deepThinking]
  );
  const chunkSize = streamConfig.chunkSize;

  const [messages, setMessages] = useState<Message[]>([WELCOME_MSG]);
  const [historyRows, setHistoryRows] = useState<Awaited<ReturnType<typeof getChatHistory>>>([]);
  const [conversations, setConversations] = useState<ChatConversationSummary[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [recommendations, setRecommendations] = useState<ResourceRecommendation[]>([]);
  const [refreshingRecommendations, setRefreshingRecommendations] = useState(false);
  const recommendationRefreshOffsetRef = useRef(0);
  const [input, setInput] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<ChatAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const uploadExtensions = useSupportedUploadFormats(true);
  const [loading, setLoading] = useState(false);
  const [backendOk, setBackendOk] = useState<boolean | null>(null);
  const [llmRouting, setLlmRouting] = useState("");
  const [stageLabel, setStageLabel] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [activeUserMessageId, setActiveUserMessageId] = useState<string | null>(null);
  const [regeneratingUserId, setRegeneratingUserId] = useState<string | null>(null);
  const [liveStreamText, setLiveStreamText] = useState("");
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const scrollRafRef = useRef(0);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const streamAccRef = useRef("");
  const tokenQueueRef = useRef<string[]>([]);
  const tokenDrainActiveRef = useRef(false);
  const tokenDrainTimerRef = useRef(0);

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

  const isNearBottom = useCallback(() => {
    const el = messagesContainerRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 140;
  }, []);

  const scrollMessagesToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const el = messagesContainerRef.current;
    if (!el) return;
    if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current);
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = 0;
      const top = Math.max(0, el.scrollHeight - el.clientHeight);
      if (behavior === "smooth") {
        el.scrollTo({ top, behavior: "smooth" });
      } else {
        el.scrollTop = top;
      }
    });
  }, []);

  /** 打开页面 / 加载历史 / 异步排版后多次补滚到底 */
  const ensureScrollOnOpen = useCallback(() => {
    stickToBottomRef.current = true;
    scrollMessagesToBottom("auto");
    requestAnimationFrame(() => scrollMessagesToBottom("auto"));
    window.setTimeout(() => scrollMessagesToBottom("auto"), 50);
    window.setTimeout(() => scrollMessagesToBottom("auto"), 200);
    window.setTimeout(() => scrollMessagesToBottom("auto"), 600);
    window.setTimeout(() => scrollMessagesToBottom("auto"), 1200);
  }, [scrollMessagesToBottom]);

  /** 流式结束 / 资源卡片挂载 / Mermaid 异步渲染后多次补滚到底 */
  const ensureScrollAfterReply = useCallback(() => {
    ensureScrollOnOpen();
    window.setTimeout(() => scrollMessagesToBottom("smooth"), 120);
    window.setTimeout(() => scrollMessagesToBottom("smooth"), 400);
  }, [ensureScrollOnOpen, scrollMessagesToBottom]);

  const scrollIfStickToBottom = useCallback(
    (behavior: ScrollBehavior = "auto") => {
      if (stickToBottomRef.current) scrollMessagesToBottom(behavior);
    },
    [scrollMessagesToBottom]
  );

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

  const loadConversationMessages = useCallback(
    async (conversationId: string, options?: { scroll?: boolean }) => {
      try {
        const rows = await getChatHistory(userId, conversationId);
        setHistoryRows(rows);
        setMessages(rows.length ? [WELCOME_MSG, ...rowsToMessages(rows)] : [WELCOME_MSG]);
        if (options?.scroll !== false) {
          ensureScrollOnOpen();
        }
      } catch {
        setHistoryRows([]);
        setMessages([WELCOME_MSG]);
      }
    },
    [userId, ensureScrollOnOpen]
  );

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
    const el = messagesContainerRef.current;
    if (!el) return;
    const onScroll = () => {
      stickToBottomRef.current = isNearBottom();
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [isNearBottom]);

  useEffect(() => {
    let cancelled = false;
    stickToBottomRef.current = true;
    setConversations([]);
    setActiveConversationId(null);
    setActiveUserMessageId(null);
    setHistoryRows([]);
    setMessages([WELCOME_MSG]);

    void (async () => {
      const list = await reloadConversations();
      if (cancelled) return;
      if (!list.length) {
        ensureScrollOnOpen();
        return;
      }
      const savedId = loadActiveChatConversation();
      const targetId = savedId && list.some((c) => c.id === savedId) ? savedId : list[0].id;
      setActiveConversationId(targetId);
      persistActiveChatConversation(targetId);
      await loadConversationMessages(targetId, { scroll: true });
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, reloadConversations, loadConversationMessages, ensureScrollOnOpen]);

  useEffect(() => {
    persistActiveChatConversation(activeConversationId);
  }, [activeConversationId]);

  useEffect(() => {
    const onDemoData = (e: Event) => {
      const action = (e as CustomEvent<{ action: "clear" | "reset" }>).detail?.action;
      setPendingAttachments([]);
      setActiveConversationId(null);
      setActiveUserMessageId(null);
      setConversations([]);
      setHistoryRows([]);
      setMessages([WELCOME_MSG]);
      if (action === "reset") {
        void reloadConversations().then((list) => {
          if (!list.length) return;
          const first = list[0].id;
          setActiveConversationId(first);
          void loadConversationMessages(first);
        });
      }
    };
    window.addEventListener(DEMO_DATA_CHANGED_EVENT, onDemoData);
    return () => window.removeEventListener(DEMO_DATA_CHANGED_EVENT, onDemoData);
  }, [reloadConversations, loadConversationMessages]);

  /** 切回智能对话 Tab 或消息列表更新后，贴底展示最新内容 */
  useLayoutEffect(() => {
    if (!pageActive || !stickToBottomRef.current) return;
    scrollMessagesToBottom("auto");
  }, [pageActive, messages, scrollMessagesToBottom]);

  useEffect(() => {
    if (!pageActive) return;
    ensureScrollOnOpen();
  }, [pageActive, ensureScrollOnOpen]);

  const loadRecommendations = useCallback(
    async (showToast = false) => {
      setRefreshingRecommendations(true);
      try {
        const offset = showToast ? ++recommendationRefreshOffsetRef.current : 0;
        const items = await getRecommendations(userId, 3, {
          refresh: showToast,
          offset,
        });
        setRecommendations(items);
        if (showToast) {
          message.success(items.length ? "今日推荐已刷新" : "暂时没有新的推荐");
        }
      } catch (e: unknown) {
        setRecommendations([]);
        if (showToast) {
          message.error(e instanceof Error ? e.message : "刷新推荐失败");
        }
      } finally {
        setRefreshingRecommendations(false);
      }
    },
    [userId]
  );

  useEffect(() => {
    void loadRecommendations(false);
  }, [loadRecommendations]);

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
    ensureScrollOnOpen();
  }, [ensureScrollOnOpen]);

  const handleSelectConversation = useCallback(
    async (conversationId: string) => {
      if (conversationId === activeConversationId) return;
      setActiveConversationId(conversationId);
      setActiveUserMessageId(null);
      stickToBottomRef.current = true;
      await loadConversationMessages(conversationId, { scroll: true });
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
          persistActiveChatConversation(null);
          await reloadConversations();
          message.success("已清空");
        } catch (e: unknown) {
          message.error(e instanceof Error ? e.message : "清空失败");
        }
      },
    });
  }, [userId, activeConversationId, reloadConversations]);

  const handleUpload = async (file: File) => {
    if (
      uploadExtensions.length &&
      !isAllowedUploadFile(file.name, uploadExtensions, { includeImages: true })
    ) {
      message.warning(`不支持 ${file.name}，请上传 PDF、PPT、Word、图片等格式`);
      return false;
    }
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
      attachments?: ChatAttachment[];
    }) => {
      const { displayContent, turnId, conversationId, attachments = [] } = params;
      setLoading(true);
      setStageLabel("正在理解你的问题");
      const typingId = "typing";
      setMessages((prev) => [
        ...prev,
        { id: typingId, role: "assistant", content: "", isTyping: true, timestamp: new Date() },
      ]);

      let acc = "";
      let finalReply = "";
      let msgResources: ResourceSummary[] | undefined;
      let replyId: string | null = null;

      const formatStage = (stage: string) =>
        WAIT_STAGE_LABELS[stage] || STAGE_LABELS[stage] || stage;

      const stopTokenDrain = () => {
        if (tokenDrainTimerRef.current) {
          window.clearTimeout(tokenDrainTimerRef.current);
          tokenDrainTimerRef.current = 0;
        }
        tokenDrainActiveRef.current = false;
      };

      const flushTokenQueueSync = () => {
        stopTokenDrain();
        while (tokenQueueRef.current.length > 0) {
          streamAccRef.current += tokenQueueRef.current.shift()!;
        }
        acc = streamAccRef.current;
      };

      const ensureStreamingMessage = () => {
        const pushLiveText = () => {
          setLiveStreamText(streamAccRef.current);
          scrollIfStickToBottom("auto");
        };

        if (replyId) {
          pushLiveText();
          return;
        }
        replyId = `local-a-${Date.now()}`;
        setStreamingMessageId(replyId);
        pushLiveText();
        setMessages((prev) =>
          prev
            .filter((m) => m.id !== typingId)
            .concat({
              id: replyId!,
              role: "assistant",
              content: "",
              turnId,
              timestamp: new Date(),
              isStreaming: true,
            })
        );
      };

      const scheduleTokenDrain = () => {
        const step = () => {
          if (tokenQueueRef.current.length === 0) {
            tokenDrainActiveRef.current = false;
            tokenDrainTimerRef.current = 0;
            return;
          }
          const piece = tokenQueueRef.current.shift()!;
          streamAccRef.current += piece;
          acc = streamAccRef.current;
          ensureStreamingMessage();

          if (tokenQueueRef.current.length === 0) {
            tokenDrainActiveRef.current = false;
            tokenDrainTimerRef.current = 0;
            return;
          }
          const gap =
            streamConfig.flushMs <= 0 ? 12 : Math.max(streamConfig.flushMs, 12);
          tokenDrainTimerRef.current = window.setTimeout(step, gap);
        };

        if (tokenDrainActiveRef.current) return;
        tokenDrainActiveRef.current = true;
        step();
      };

      const waitForTokenDrain = () =>
        new Promise<void>((resolve) => {
          const poll = () => {
            if (tokenQueueRef.current.length === 0 && !tokenDrainActiveRef.current) {
              resolve();
              return;
            }
            window.requestAnimationFrame(poll);
          };
          poll();
        });

      const finalizeStreamingMessage = (finalContent: string) => {
        stopTokenDrain();
        flushSync(() => {
          setLiveStreamText("");
          setStreamingMessageId(null);
          if (!replyId) {
            replyId = `local-a-${Date.now()}`;
            setMessages((prev) =>
              prev
                .filter((m) => m.id !== typingId)
                .concat({
                  id: replyId!,
                  role: "assistant",
                  content: finalContent,
                  turnId,
                  timestamp: new Date(),
                })
            );
            return;
          }
          setMessages((prev) =>
            prev
              .filter((m) => m.id !== typingId)
              .map((m) =>
                m.id === replyId ? { ...m, content: finalContent, isStreaming: false } : m
              )
          );
        });
        ensureScrollAfterReply();
      };

      streamAccRef.current = "";
      tokenQueueRef.current = [];
      stopTokenDrain();

      try {
        await streamChat(
          userId,
          displayContent,
          {
            onToken: (token: string) => {
              tokenQueueRef.current.push(token);
              scheduleTokenDrain();
            },
            onProgress: (stage: string) => setStageLabel(formatStage(stage)),
            onDone: (reply: string) => {
              finalReply = reply;
            },
            onError: (err: string) => {
              const text = err.startsWith("⚠️") ? err : `⚠️ ${err}`;
              finalReply = text;
              tokenQueueRef.current.push(text);
              scheduleTokenDrain();
            },
            onIntent: (intent: string) => setStageLabel(formatStage(intent)),
            onRealtimeState: () => setStageLabel(formatStage("realtime_state")),
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
          "",
          attachments
        );

        await waitForTokenDrain();
        flushTokenQueueSync();
        if (finalReply && finalReply !== streamAccRef.current) {
          streamAccRef.current = finalReply;
        }
        acc = streamAccRef.current;

        const assistantText = (finalReply || acc).trim();
        if (!assistantText) {
          stopTokenDrain();
          setLiveStreamText("");
          setStreamingMessageId(null);
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
          ensureScrollAfterReply();
        } else {
          finalizeStreamingMessage(assistantText);
        }

        if (assistantText && msgResources?.length && replyId) {
          setMessages((prev) =>
            prev.map((m) => (m.id === replyId ? { ...m, resources: msgResources } : m))
          );
          ensureScrollAfterReply();
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
        void loadRecommendations(false);
      } catch (err: unknown) {
        const msgText = err instanceof Error ? err.message : "未知错误";
        const errContent = `⚠️ ${msgText}\n\n若持续出现，请运行 **stop.bat** 再 **start.bat** 重启服务，或检查 .env 中 Kimi API 配置。`;
        finalizeStreamingMessage(errContent);
        await appendChatHistory(userId, "assistant", errContent, [], {
          turnId,
          conversationId,
        }).catch(() => null);
      } finally {
        stopTokenDrain();
        tokenQueueRef.current = [];
        setLiveStreamText("");
        setStreamingMessageId(null);
        setStageLabel("");
        setLoading(false);
        setMessages((prev) =>
          prev
            .filter((m) => m.id !== typingId)
            .map((m) => (m.isStreaming ? { ...m, isStreaming: false } : m))
        );
        ensureScrollAfterReply();
        void reloadConversations();
      }
    },
    [
      userId,
      setProfile,
      chunkSize,
      deepThinking,
      webSearch,
      streamConfig,
      streamSpeed,
      addResources,
      syncAfterChat,
      loadRecommendations,
      ttsEnabled,
      voice,
      reloadHistory,
      reloadConversations,
      ensureScrollAfterReply,
      scrollIfStickToBottom,
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
          attachments: userMsg.attachments || [],
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
      ensureScrollOnOpen();

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
        attachments,
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
      ensureScrollOnOpen,
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
          <Space size={4} className="lp-chat-header-actions">
            <Tooltip title="历史对话">
              <Button
                icon={<HistoryOutlined />}
                size="small"
                onClick={() => setHistoryOpen(true)}
              />
            </Tooltip>
            <Tooltip title="新对话">
              <Button
                icon={<PlusOutlined />}
                size="small"
                onClick={() => void handleNewConversation()}
              />
            </Tooltip>
            <Tooltip title="清空当前对话">
              <Button icon={<ReloadOutlined />} size="small" onClick={handleClearChat} />
            </Tooltip>
          </Space>
        }
      />

      <ChatHistorySidebar
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        groups={conversationGroups}
        activeConversationId={activeConversationId}
        onSelectConversation={handleSelectConversation}
        onDeleteConversation={handleDeleteConversation}
        onNewChat={() => void handleNewConversation()}
      />

      <div className="lp-chat-main">
        <div className="lp-chat-column">
          <div className="lp-chat-recommendations">
            <span className="lp-muted-text lp-chat-recommendations-title">
              今日推荐
            </span>
            <Tooltip title="刷新推荐">
              <Button
                aria-label="刷新今日推荐"
                className="lp-chat-recommendations-refresh"
                icon={<ReloadOutlined spin={refreshingRecommendations} />}
                loading={refreshingRecommendations}
                size="small"
                type="text"
                onClick={() => void loadRecommendations(true)}
              />
            </Tooltip>
            {recommendations.length > 0 ? (
              recommendations.map((rec) => (
                <Tooltip key={rec.id} title={rec.reason || rec.topic || undefined}>
                  <Tag
                    className="lp-quick-tag"
                    color="processing"
                    onClick={() => handleResourceClick(rec.id)}
                  >
                    {rec.title}
                  </Tag>
                </Tooltip>
              ))
            ) : (
              <span className="lp-muted-text lp-chat-recommendations-empty">
                暂无推荐
              </span>
            )}
          </div>

          <div className="lp-chat-messages" ref={messagesContainerRef}>
            {messages.map((msg) => (
              <MessageItem
                key={msg.id}
                msg={msg}
                liveStreamText={msg.id === streamingMessageId ? liveStreamText : undefined}
                thinkingLabel={msg.isTyping ? stageLabel : undefined}
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
                accept={buildUploadAccept(uploadExtensions, { includeImages: true })}
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
