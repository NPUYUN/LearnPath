import type { ChatConversationSummary, ChatMessageItem } from "@/lib/api";

export type ChatTurnEntry = {
  turnId: string;
  userMessageId: string;
  userContent: string;
  assistantMessageId?: string;
  createdAt: Date;
};

export type ChatHistoryDateGroup = {
  dateKey: string;
  dateLabel: string;
  turns: ChatTurnEntry[];
};

export type ConversationDateGroup = {
  dateKey: string;
  dateLabel: string;
  conversations: ChatConversationSummary[];
};

function dateLabel(d: Date): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = (today.getTime() - target.getTime()) / 86400000;
  if (diff === 0) return "今天";
  if (diff === 1) return "昨天";
  return d.toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "short" });
}

export function buildTurnsFromHistory(rows: ChatMessageItem[]): ChatTurnEntry[] {
  const turns: ChatTurnEntry[] = [];
  const byTurn = new Map<string, ChatTurnEntry>();

  for (const row of rows) {
    if (row.role === "user") {
      const entry: ChatTurnEntry = {
        turnId: row.turn_id || row.id,
        userMessageId: row.id,
        userContent: row.content,
        createdAt: new Date(row.created_at),
      };
      turns.push(entry);
      if (row.turn_id) byTurn.set(row.turn_id, entry);
      byTurn.set(row.id, entry);
    } else if (row.role === "assistant") {
      let entry = row.turn_id ? byTurn.get(row.turn_id) : undefined;
      if (!entry) {
        const last = turns[turns.length - 1];
        if (last && !last.assistantMessageId) entry = last;
      }
      if (entry) entry.assistantMessageId = row.id;
    }
  }
  return turns;
}

export function groupTurnsByDate(turns: ChatTurnEntry[]): ChatHistoryDateGroup[] {
  const map = new Map<string, ChatTurnEntry[]>();
  for (const t of turns) {
    const key = t.createdAt.toISOString().slice(0, 10);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(t);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([dateKey, list]) => ({
      dateKey,
      dateLabel: dateLabel(new Date(dateKey)),
      turns: list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
    }));
}

export function previewTurnText(content: string, max = 36): string {
  const t = content.replace(/\s+/g, " ").trim();
  if (!t) return "（空消息）";
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

export function groupConversationsByDate(
  conversations: ChatConversationSummary[]
): ConversationDateGroup[] {
  const map = new Map<string, ChatConversationSummary[]>();
  for (const c of conversations) {
    const raw = c.updated_at || c.created_at;
    const key = raw ? raw.slice(0, 10) : "unknown";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(c);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([dateKey, list]) => ({
      dateKey,
      dateLabel: dateLabel(new Date(dateKey + "T12:00:00")),
      conversations: list.sort((a, b) => {
        const ta = new Date(a.updated_at || a.created_at).getTime();
        const tb = new Date(b.updated_at || b.created_at).getTime();
        return tb - ta;
      }),
    }));
}

export function buildAttachmentContext(attachments: { text_preview?: string; name: string; kind: string }[]): string {
  const parts: string[] = [];
  attachments.forEach((a, i) => {
    if (a.kind === "image") {
      parts.push(`[${i + 1}] 图片：${a.name}`);
    } else if (a.text_preview?.trim()) {
      parts.push(`[${i + 1}] ${a.name}：\n${a.text_preview.trim()}`);
    } else {
      parts.push(`[${i + 1}] 文件：${a.name}`);
    }
  });
  return parts.join("\n\n");
}
