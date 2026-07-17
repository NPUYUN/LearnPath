"use client";

import { Card, Col, Row, Select, Switch, Typography, Button, Divider, message, Segmented, Modal, Space } from "antd";
import SettingOutlined from "@ant-design/icons/SettingOutlined";
import SoundOutlined from "@ant-design/icons/SoundOutlined";
import BgColorsOutlined from "@ant-design/icons/BgColorsOutlined";
import ThunderboltOutlined from "@ant-design/icons/ThunderboltOutlined";
import BulbOutlined from "@ant-design/icons/BulbOutlined";
import DeleteOutlined from "@ant-design/icons/DeleteOutlined";
import ReloadOutlined from "@ant-design/icons/ReloadOutlined";
import PageHeader from "@/components/PageHeader";
import { STREAM_SPEED_OPTIONS } from "@/lib/streamSpeed";
import { clearDemoUserDataSelf, resetDemoUserDataSelf } from "@/lib/api";
import {
  applyDemoClearToStore,
  notifyDemoDataChanged,
  reloadDemoDataToStore,
} from "@/lib/demoDataSync";
import { isDemoUser, useAppStore } from "@/store/appStore";
import {
  useSettingsStore,
  type FontSizePreset,
  type StreamSpeed,
  type ThemeMode,
  type VoicePreset,
} from "@/store/settingsStore";

const { Text, Paragraph } = Typography;

export default function SettingsContent() {
  const userId = useAppStore((s) => s.userId);
  const demoMode = isDemoUser(userId);
  const theme = useSettingsStore((s) => s.theme);
  const voice = useSettingsStore((s) => s.voice);
  const ttsEnabled = useSettingsStore((s) => s.ttsEnabled);
  const fontSize = useSettingsStore((s) => s.fontSize);
  const streamSpeed = useSettingsStore((s) => s.streamSpeed);
  const reduceMotion = useSettingsStore((s) => s.reduceMotion);
  const deepThinking = useSettingsStore((s) => s.deepThinking);
  const setSettings = useSettingsStore((s) => s.setSettings);
  const resetSettings = useSettingsStore((s) => s.resetSettings);

  const handleReset = () => {
    resetSettings();
    message.success("已恢复默认设置");
  };

  const handleDemoClear = () => {
    Modal.confirm({
      title: "清空全部演示数据？",
      content:
        "将删除学习画像、资源、路径、对话、资料库与测验记录等全部数据，不会自动填入示例内容。界面设置将恢复默认。",
      okText: "清空",
      okType: "danger",
      cancelText: "取消",
      onOk: async () => {
        try {
          await clearDemoUserDataSelf();
          applyDemoClearToStore();
          notifyDemoDataChanged("clear");
          message.success("已清空全部数据，设置已恢复默认");
        } catch (e: unknown) {
          message.error(e instanceof Error ? e.message : "清空失败");
        }
      },
    });
  };

  const handleDemoReset = () => {
    Modal.confirm({
      title: "重置为默认演示数据？",
      content:
        "将用系统预设的示例画像、资源、路径与对话覆盖当前全部数据，并恢复默认界面设置。",
      okText: "重置",
      cancelText: "取消",
      onOk: async () => {
        try {
          await resetDemoUserDataSelf();
          await reloadDemoDataToStore(userId);
          notifyDemoDataChanged("reset");
          message.success("已恢复默认演示数据与设置");
        } catch (e: unknown) {
          message.error(e instanceof Error ? e.message : "重置失败");
        }
      },
    });
  };

  return (
    <div className="lp-settings-page">
      <PageHeader
        title="设置"
        subtitle="主题、语音与交互偏好 · 本地保存"
        icon={<SettingOutlined />}
        extra={
          <Button icon={<ReloadOutlined />} onClick={handleReset}>恢复默认</Button>
        }
      />
      <div className="lp-page-body">
        <Row gutter={[20, 20]}>
          <Col xs={24} lg={12}>
            <Card
              className="lp-settings-card"
              title={
                <span>
                  <BgColorsOutlined style={{ marginRight: 8 }} />
                  外观
                </span>
              }
            >
              <div className="lp-settings-row">
                <Text>主题模式</Text>
                <Select
                  style={{ width: 200 }}
                  value={theme}
                  onChange={(v: ThemeMode) => setSettings({ theme: v })}
                  options={[
                    { value: "light", label: "浅色" },
                    { value: "dark", label: "深色" },
                    { value: "system", label: "跟随系统" },
                  ]}
                />
              </div>
              <div className="lp-settings-row">
                <Text>界面字号</Text>
                <Select
                  style={{ width: 200 }}
                  value={fontSize}
                  onChange={(v: FontSizePreset) => setSettings({ fontSize: v })}
                  options={[
                    { value: "normal", label: "标准" },
                    { value: "large", label: "较大" },
                  ]}
                />
              </div>
              <div className="lp-settings-row">
                <Text>减少动效</Text>
                <Switch
                  checked={reduceMotion}
                  onChange={(v) => setSettings({ reduceMotion: v })}
                />
              </div>
            </Card>
          </Col>

          <Col xs={24} lg={12}>
            <Card
              className="lp-settings-card"
              title={
                <span>
                  <SoundOutlined style={{ marginRight: 8 }} />
                  语音与朗读
                </span>
              }
            >
              <div className="lp-settings-row">
                <Text>启用语音朗读</Text>
                <Switch
                  checked={ttsEnabled}
                  onChange={(v) => setSettings({ ttsEnabled: v })}
                />
              </div>
              <div className="lp-settings-row">
                <Text>音色</Text>
                <Select
                  style={{ width: 200 }}
                  disabled={!ttsEnabled}
                  value={voice}
                  onChange={(v: VoicePreset) => setSettings({ voice: v })}
                  options={[
                    { value: "female", label: "女声（讯飞 TTS）" },
                    { value: "male", label: "男声（讯飞 TTS）" },
                    { value: "off", label: "关闭" },
                  ]}
                />
              </div>
              <Paragraph type="secondary" style={{ marginTop: 12, fontSize: 13 }}>
                语音参数将用于后续对接星火 TTS；当前为偏好存储，对话页可按需读取。
              </Paragraph>
            </Card>
          </Col>

          <Col xs={24}>
            <Card
              className="lp-settings-card"
              title={
                <span>
                  <ThunderboltOutlined style={{ marginRight: 8 }} />
                  学习交互
                </span>
              }
            >
              <div className="lp-settings-row">
                <Text>流式回复速度</Text>
                <Segmented
                  value={streamSpeed}
                  onChange={(v) => setSettings({ streamSpeed: v as StreamSpeed })}
                  options={STREAM_SPEED_OPTIONS}
                />
              </div>
              <Paragraph type="secondary" style={{ margin: "4px 0 12px", fontSize: 13 }}>
                慢：逐段展示；快：流畅打字（默认）；立刻：完成后一次性排版渲染。
              </Paragraph>
              <div className="lp-settings-row">
                <span>
                  <BulbOutlined style={{ marginRight: 6, color: "#faad14" }} />
                  深度思考
                </span>
                <Switch
                  checked={deepThinking}
                  onChange={(v) => setSettings({ deepThinking: v })}
                />
              </div>
              <Paragraph type="secondary" style={{ margin: "0 0 8px", fontSize: 13 }}>
                开启后：先「分析要点」再「结论」，篇幅更长、响应更慢。关闭时：直接给精简要点（约 300–500 字），响应更快。与对话页开关同步。
              </Paragraph>
              <Divider style={{ margin: "16px 0" }} />
              <Text type="secondary">
                核心能力（对话画像、资源生成、学习路径、评估）在侧栏主菜单中；本页为体验与偏好设置。
              </Text>
            </Card>
          </Col>

          {demoMode && (
            <Col xs={24}>
              <Card
                className="lp-settings-card lp-settings-card--danger"
                title={
                  <span>
                    <DeleteOutlined style={{ marginRight: 8 }} />
                    演示数据管理
                  </span>
                }
              >
                <Paragraph type="secondary" style={{ marginBottom: 16 }}>
                  便于答辩与测试：「清空」后从零体验完整流程；「重置」一键恢复预设示例内容。两项操作均会将下方界面设置恢复为默认。
                </Paragraph>
                <Space wrap>
                  <Button danger icon={<DeleteOutlined />} onClick={handleDemoClear}>
                    清空全部数据
                  </Button>
                  <Button icon={<ReloadOutlined />} onClick={handleDemoReset}>
                    重置为默认数据
                  </Button>
                </Space>
              </Card>
            </Col>
          )}
        </Row>
      </div>
    </div>
  );
}
