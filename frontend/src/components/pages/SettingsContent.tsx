"use client";

import { Card, Col, Row, Select, Switch, Typography, Button, Divider, message } from "antd";
import SettingOutlined from "@ant-design/icons/SettingOutlined";
import SoundOutlined from "@ant-design/icons/SoundOutlined";
import BgColorsOutlined from "@ant-design/icons/BgColorsOutlined";
import ThunderboltOutlined from "@ant-design/icons/ThunderboltOutlined";
import PageHeader from "@/components/PageHeader";
import {
  useSettingsStore,
  type FontSizePreset,
  type StreamSpeed,
  type ThemeMode,
  type VoicePreset,
} from "@/store/settingsStore";

const { Text, Paragraph } = Typography;

export default function SettingsContent() {
  const theme = useSettingsStore((s) => s.theme);
  const voice = useSettingsStore((s) => s.voice);
  const ttsEnabled = useSettingsStore((s) => s.ttsEnabled);
  const fontSize = useSettingsStore((s) => s.fontSize);
  const streamSpeed = useSettingsStore((s) => s.streamSpeed);
  const reduceMotion = useSettingsStore((s) => s.reduceMotion);
  const setSettings = useSettingsStore((s) => s.setSettings);
  const resetSettings = useSettingsStore((s) => s.resetSettings);

  const handleReset = () => {
    resetSettings();
    message.success("已恢复默认设置");
  };

  return (
    <div>
      <PageHeader
        title="设置"
        subtitle="主题、语音与交互偏好 · 本地保存"
        icon={<SettingOutlined />}
        extra={
          <Button onClick={handleReset}>恢复默认</Button>
        }
      />
      <div className="lp-page-body">
        <Row gutter={[20, 20]}>
          <Col xs={24} lg={12}>
            <Card
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
              title={
                <span>
                  <ThunderboltOutlined style={{ marginRight: 8 }} />
                  学习交互
                </span>
              }
            >
              <div className="lp-settings-row">
                <Text>流式回复速度</Text>
                <Select
                  style={{ width: 200 }}
                  value={streamSpeed}
                  onChange={(v: StreamSpeed) => setSettings({ streamSpeed: v })}
                  options={[
                    { value: "normal", label: "标准" },
                    { value: "fast", label: "较快（演示）" },
                  ]}
                />
              </div>
              <Divider style={{ margin: "16px 0" }} />
              <Text type="secondary">
                赛题核心能力（对话画像、资源生成、学习路径、评估）在侧栏主菜单中；本页为产品体验增强，非赛题硬性要求。
              </Text>
            </Card>
          </Col>
        </Row>
      </div>
    </div>
  );
}
