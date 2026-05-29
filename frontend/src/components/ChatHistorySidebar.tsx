"use client";

import { Button, Empty, Typography } from "antd";
import {
  DeleteOutlined,
  PlusOutlined,
  UnorderedListOutlined,
} from "@ant-design/icons";
import type { ConversationDateGroup } from "@/lib/chatHistoryUtils";
import { previewTurnText } from "@/lib/chatHistoryUtils";

const { Text } = Typography;

type ChatHistorySidebarProps = {
  groups: ConversationDateGroup[];
  activeConversationId: string | null;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onSelectConversation: (conversationId: string) => void;
  onDeleteConversation: (conversationId: string) => void;
  onNewChat: () => void;
};

export default function ChatHistorySidebar({
  groups,
  activeConversationId,
  collapsed,
  onToggleCollapse,
  onSelectConversation,
  onDeleteConversation,
  onNewChat,
}: ChatHistorySidebarProps) {
  if (collapsed) {
    return (
      <div className="lp-chat-sidebar lp-chat-sidebar--collapsed">
        <Button
          type="text"
          icon={<UnorderedListOutlined />}
          onClick={onToggleCollapse}
          title="展开对话目录"
        />
      </div>
    );
  }

  const total = groups.reduce((n, g) => n + g.conversations.length, 0);

  return (
    <aside className="lp-chat-sidebar">
      <div className="lp-chat-sidebar-head">
        <Text strong>对话目录</Text>
        <div className="lp-chat-sidebar-head-actions">
          <Button type="text" size="small" icon={<PlusOutlined />} onClick={onNewChat}>
            新对话
          </Button>
          <Button
            type="text"
            size="small"
            icon={<UnorderedListOutlined />}
            onClick={onToggleCollapse}
          />
        </div>
      </div>

      <div className="lp-chat-sidebar-body">
        {total === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无历史对话" />
        ) : (
          groups.map((group) => (
            <div key={group.dateKey} className="lp-chat-sidebar-group">
              <div className="lp-chat-sidebar-date">{group.dateLabel}</div>
              {group.conversations.map((conv) => {
                const active = activeConversationId === conv.id;
                return (
                  <div
                    key={conv.id}
                    className={`lp-chat-sidebar-item${active ? " lp-chat-sidebar-item--active" : ""}`}
                  >
                    <button
                      type="button"
                      className="lp-chat-sidebar-item-main"
                      onClick={() => onSelectConversation(conv.id)}
                    >
                      {previewTurnText(conv.title)}
                    </button>
                    <Button
                      type="text"
                      size="small"
                      danger
                      className="lp-chat-sidebar-item-del"
                      icon={<DeleteOutlined />}
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteConversation(conv.id);
                      }}
                    />
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
