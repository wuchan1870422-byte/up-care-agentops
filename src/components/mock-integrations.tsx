"use client";
import { useState } from "react";
import { api } from "@/lib/transport";
import type { RecordRow } from "@/lib/types";

export function MockIntegrations({
  leads,
  integrations,
  onComplete,
}: {
  leads: RecordRow<unknown>[];
  integrations: RecordRow<{ leadId: string }>[];
  onComplete: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  async function perform(action: () => Promise<string>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      setMessage(await action());
      await onComplete();
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>模拟业务接口</h2>
          <p>
            使用当前空间的真实演示记录验证对接流程；未连接真实 CRM 或预约系统。
          </p>
        </div>
      </div>
      <div className="form-content">
        <button
          className="secondary"
          disabled={busy}
          onClick={() =>
            void perform(async () => {
              const data = await api<{
                items: unknown[];
                availability: string;
              }>("mock/appointments");
              return `模拟预约接口返回 ${data.items.length} 条意向；排班状态：未核实。`;
            })
          }
        >
          查询模拟预约接口
        </button>
        {leads.length === 0 ? (
          <p className="muted">
            先在 Agent 工作台完成预约意向，系统会生成可同步的虚构线索。
          </p>
        ) : (
          leads.slice(0, 10).map((lead) => {
            const synced = integrations.some((r) => r.data.leadId === lead.id);
            return (
              <div className="actions" key={lead.id}>
                <code>线索 #{lead.id.slice(0, 8)}</code>
                <button
                  className="secondary"
                  disabled={busy || synced}
                  onClick={() =>
                    void perform(async () => {
                      await api("mock/crm/sync", {
                        leadId: lead.id,
                        key: "mock-crm-" + lead.id,
                      });
                      return "已保存模拟 CRM 同步记录；没有向外部发送数据。";
                    })
                  }
                >
                  {synced ? "已模拟同步" : "模拟同步 CRM"}
                </button>
              </div>
            );
          })
        )}
        <p className="muted">
          同步需门诊运营或管理员角色；重复同步使用同一幂等键，记录写入运行审计。
        </p>
        {message && (
          <p className="info-box" role="status">
            {message}
          </p>
        )}
        {error && (
          <p className="alert error" role="alert">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
