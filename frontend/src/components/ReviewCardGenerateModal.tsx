"use client";

import { useMemo, useState } from "react";
import { AutoComplete, Button, Input, Modal, Typography, message } from "antd";
import ReadOutlined from "@ant-design/icons/ReadOutlined";
import { generateReviewCard } from "@/lib/api";
import { collectMajorReviewTopics } from "@/lib/reviewCardTopics";

const { Text, Paragraph } = Typography;

type ReviewCardGenerateModalProps = {
  open: boolean;
  userId: string;
  topicSuggestions: string[];
  onClose: () => void;
  onCreated: () => void;
};

export default function ReviewCardGenerateModal({
  open,
  userId,
  topicSuggestions,
  onClose,
  onCreated,
}: ReviewCardGenerateModalProps) {
  const [topic, setTopic] = useState("");
  const [generating, setGenerating] = useState(false);

  const options = useMemo(() => {
    const majors = collectMajorReviewTopics(topicSuggestions);
    return majors.slice(0, 24).map((value) => ({ value }));
  }, [topicSuggestions]);

  const handleGenerate = async () => {
    const value = topic.trim();
    if (!value) {
      message.warning("请输入或选择复习主题");
      return;
    }
    setGenerating(true);
    try {
      const { card } = await generateReviewCard(userId, value);
      message.success(`已生成「${card.title}」`);
      setTopic("");
      onCreated();
      onClose();
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "生成复习卡失败");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Modal
      title={
        <div>
          <div style={{ fontWeight: 600 }}>生成专属复习卡</div>
          <Text type="secondary" style={{ fontSize: 13, fontWeight: 400 }}>
            按主题浓缩考点与易错点，区别于常规多类型学习资源
          </Text>
        </div>
      }
      open={open}
      onCancel={onClose}
      destroyOnHidden
      width={560}
      footer={[
        <Button key="cancel" onClick={onClose} disabled={generating}>
          取消
        </Button>,
        <Button
          key="ok"
          type="primary"
          icon={<ReadOutlined />}
          loading={generating}
          onClick={() => void handleGenerate()}
        >
          生成复习卡
        </Button>,
      ]}
    >
      <Paragraph type="secondary" style={{ marginBottom: 12 }}>
        可从路径阶段、已有资源主题中选择，或直接输入关键词（如「梯度下降」「Python 列表推导」）。
      </Paragraph>
      <Text strong style={{ display: "block", marginBottom: 8 }}>
        复习主题
      </Text>
      <AutoComplete
        style={{ width: "100%" }}
        options={options}
        value={topic}
        onChange={setTopic}
        onSelect={setTopic}
        filterOption={(input, option) =>
          String(option?.value || "")
            .toLowerCase()
            .includes(input.trim().toLowerCase())
        }
      >
        <Input
          placeholder="输入或搜索主题，例如：线性回归、Python 基础语法"
          onPressEnter={() => void handleGenerate()}
          maxLength={120}
        />
      </AutoComplete>
    </Modal>
  );
}
