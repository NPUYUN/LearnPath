"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card, Popconfirm, Space, Table, Tag, Typography, message } from "antd";
import DeleteOutlined from "@ant-design/icons/DeleteOutlined";
import ReloadOutlined from "@ant-design/icons/ReloadOutlined";
import {
  deleteAdminUser,
  getAdminUsers,
  resetDemoUserData,
  type AdminUserRow,
} from "@/lib/api";

const { Title, Text } = Typography;

export default function AdminUsersContent() {
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAdminUsers();
      setRows(res.users);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleDelete = async (userId: string) => {
    setActingId(userId);
    try {
      await deleteAdminUser(userId);
      message.success("用户已删除");
      await load();
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : "删除失败");
    } finally {
      setActingId(null);
    }
  };

  const handleResetDemo = async () => {
    setActingId("demo");
    try {
      await resetDemoUserData();
      message.success("演示账号数据已重置");
      await load();
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : "重置失败");
    } finally {
      setActingId(null);
    }
  };

  return (
    <div className="lp-admin-page">
      <header className="lp-admin-page-header">
        <div>
          <Title level={3} style={{ margin: 0 }}>
            用户管理
          </Title>
          <Text type="secondary">查看、删除注册用户；演示账号支持一键重置示例数据</Text>
        </div>
        <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>
          刷新
        </Button>
      </header>

      <Card className="lp-admin-table-card">
        <Table
          rowKey="user_id"
          loading={loading}
          dataSource={rows}
          pagination={{ pageSize: 12 }}
          columns={[
            {
              title: "用户",
              dataIndex: "display_name",
              render: (name: string, r: AdminUserRow) => (
                <div>
                  <div>{name}</div>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {r.email || r.user_id}
                  </Text>
                </div>
              ),
            },
            {
              title: "类型",
              dataIndex: "kind",
              render: (k: string) => (
                <Tag color={k === "demo" ? "blue" : k === "registered" ? "green" : "default"}>
                  {k === "demo" ? "演示" : "注册"}
                </Tag>
              ),
            },
            { title: "课程", dataIndex: "course_name", ellipsis: true },
            { title: "资源数", dataIndex: "resource_count", width: 90 },
            { title: "消息数", dataIndex: "message_count", width: 90 },
            { title: "注册时间", dataIndex: "created_at", width: 180 },
            {
              title: "操作",
              key: "actions",
              width: 160,
              render: (_: unknown, r: AdminUserRow) => {
                if (r.kind === "demo") {
                  return (
                    <Popconfirm
                      title="重置演示账号？"
                      description="将清空演示学生的学习数据并恢复默认示例内容。"
                      okText="重置"
                      cancelText="取消"
                      onConfirm={() => void handleResetDemo()}
                    >
                      <Button
                        size="small"
                        icon={<ReloadOutlined />}
                        loading={actingId === "demo"}
                      >
                        重置数据
                      </Button>
                    </Popconfirm>
                  );
                }
                return (
                  <Popconfirm
                    title="确认删除该用户？"
                    description="将永久删除账号及其全部学习数据，此操作不可恢复。"
                    okText="删除"
                    okButtonProps={{ danger: true }}
                    cancelText="取消"
                    onConfirm={() => void handleDelete(r.user_id)}
                  >
                    <Button
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      loading={actingId === r.user_id}
                    >
                      删除
                    </Button>
                  </Popconfirm>
                );
              },
            },
          ]}
        />
      </Card>
    </div>
  );
}
