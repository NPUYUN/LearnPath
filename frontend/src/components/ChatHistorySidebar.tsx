"use client";

import { Button, Drawer, Empty, Typography } from "antd";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import type { ConversationDateGroup } from "@/lib/chatHistoryUtils";
import { previewTurnText } from "@/lib/chatHistoryUtils";

const { Text } = Typography;

type ChatHistorySidebarProps = {
  open: boolean;
  onClose: () => void;
  groups: ConversationDateGroup[];
  activeConversationId: string | null;
  onSelectConversation: (conversationId: string) => void;
  onDeleteConversation: (conversationId: string) => void;
  onNewChat: () => void;
};

export default function ChatHistorySidebar({
  open,
  onClose,
  groups,
  activeConversationId,
  onSelectConversation,
  onDeleteConversation,
  onNewChat,
}: ChatHistorySidebarProps) {
  const total = groups.reduce((n, g) => n + g.conversations.length, 0);

  const handleSelect = (conversationId: string) => {
    onSelectConversation(conversationId);
    onClose();
  };

  const handleNew = () => {
    onNewChat();
    onClose();
  };

  return (
    <Drawer
      title="历史对话"
      placement="right"
      open={open}
      onClose={onClose}
      width={300}
      destroyOnClose={false}
      className="lp-chat-history-drawer"
      styles={{
        body: { padding: "12px 8px 16px" },
        header: { padding: "12px 16px" },
      }}
      extra={
        <Button type="primary" size="small" icon={<PlusOutlined />} onClick={handleNew}>
          新对话
        </Button>
      }
    >
      {total === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无历史对话">
          <Button type="primary" ghost size="small" icon={<PlusOutlined />} onClick={handleNew}>
            开始新对话
          </Button>
        </Empty>
      ) : (
        <div className="lp-chat-history-list">
          {groups.map((group) => (
            <section key={group.dateKey} className="lp-chat-history-group">
              <div className="lp-chat-history-date">{group.dateLabel}</div>
              <ul className="lp-chat-history-items">
                {group.conversations.map((conv) => {
                  const active = activeConversationId === conv.id;
                  return (
                    <li
                      key={conv.id}
                      className={`lp-chat-history-item${active ? " lp-chat-history-item--active" : ""}`}
                    >
                      <button
                        type="button"
                        className="lp-chat-history-item-main"
                        onClick={() => handleSelect(conv.id)}
                      >
                        <span className="lp-chat-history-item-title">
                          {previewTurnText(conv.title)}
                        </span>
                      </button>
                      <Button
                        type="text"
                        size="small"
                        danger
                        className="lp-chat-history-item-del"
                        icon={<DeleteOutlined />}
                        aria-label="删除对话"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteConversation(conv.id);
                        }}
                      />
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
      {total > 0 && (
        <Text type="secondary" className="lp-chat-history-foot">
          共 {total} 条对话
        </Text>
      )}
    </Drawer>
  );
}
