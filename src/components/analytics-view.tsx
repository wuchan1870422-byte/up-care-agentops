"use client";
import { useState } from "react";
import { api, downloadTickets } from "@/lib/transport";
type Report = {
  trend: { date: string; runs: number; tickets: number }[];
  states: { status: string; count: number }[];
  intents: { intent: string; count: number }[];
  riskTypes: Record<string, number>;
  retrievalHitRate: number | null;
  meanResolutionMs: number | null;
  failures: number;
  runCount: number;
  ticketCount: number;
};
const labels: Record<string, string> = {
  pending: "待审核",
  approved: "已审核",
  in_progress: "处理中",
  completed: "已完成",
  rejected: "已拒绝",
  appointment: "预约意向",
  insurance: "保险咨询",
  clinic: "院区服务",
  medical: "专业审核",
  unknown: "待明确",
};
export function AnalyticsView({ initial }: { initial: Report }) {
  const [report, setReport] = useState(initial),
    [clinic, setClinic] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [status, setStatus] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <>
      <form
        className="filterbar"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            setReport(
              await api<Report>(
                "analytics?" + new URLSearchParams({ clinic, from, to }),
              ),
            );
          } catch (e) {
            setError(e instanceof Error ? e.message : "查询失败");
          } finally {
            setBusy(false);
          }
        }}
      >
        <select
          aria-label="分析院区"
          value={clinic}
          onChange={(e) => setClinic(e.target.value)}
        >
          <option value="">全部院区</option>
          {Object.entries({
            qiantan: "前滩",
            jingan: "静安",
            gubei: "古北",
            xintiandi: "新天地",
          }).map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
        <input
          aria-label="开始日期"
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
        <span>至</span>
        <input
          aria-label="结束日期"
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
        <button disabled={busy}>查询分析</button>
        <select
          aria-label="导出工单状态"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">导出全部状态</option>
          {["pending", "approved", "in_progress", "completed", "rejected"].map(
            (s) => (
              <option key={s} value={s}>
                {labels[s]}
              </option>
            ),
          )}
        </select>
        <button
          type="button"
          className="secondary"
          disabled={busy}
          onClick={() =>
            void downloadTickets(
              "?" + new URLSearchParams({ clinic, from, to, status }),
            ).catch((e) => setError(e.message))
          }
        >
          导出筛选工单 CSV
        </button>
      </form>
      <p className="muted">
        日期按 UTC 统计；CSV
        使用当前院区、日期与工单状态条件，需管理者或管理员角色。
      </p>
      {error && <p role="alert">{error}</p>}
      <div className="metric-grid">
        {[
          ["工作流运行", report.runCount],
          ["服务工单", report.ticketCount],
          [
            "检索命中",
            report.retrievalHitRate === null
              ? "—"
              : (report.retrievalHitRate * 100).toFixed(1) + "%",
          ],
          [
            "平均工单处理",
            report.meanResolutionMs === null
              ? "—"
              : (report.meanResolutionMs / 60000).toFixed(1) + " 分钟",
          ],
        ].map(([label, value]) => (
          <div className="metric" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
            <small>来自当前空间保存记录</small>
          </div>
        ))}
      </div>
      <div className="two-column">
        <section className="panel">
          <div className="panel-heading">
            <h2>每日执行趋势 · UTC 日期</h2>
          </div>
          <div className="clinic-chart">
            {report.trend.length ? (
              report.trend.map((day) => (
                <div key={day.date}>
                  <div>
                    <span>{day.date}</span>
                    <strong>
                      {day.runs} 执行 · {day.tickets} 工单
                    </strong>
                  </div>
                  <div className="bar-track">
                    <div
                      style={{
                        width:
                          (day.runs /
                            Math.max(1, ...report.trend.map((d) => d.runs))) *
                            100 +
                          "%",
                      }}
                    />
                  </div>
                </div>
              ))
            ) : (
              <p className="muted">尚无符合筛选条件的执行记录</p>
            )}
          </div>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <h2>工单状态分布</h2>
          </div>
          <div className="clinic-chart">
            {report.states.map((s) => (
              <div key={s.status}>
                <div>
                  <span>{labels[s.status]}</span>
                  <strong>{s.count}</strong>
                </div>
                <div className="bar-track">
                  <div
                    style={{
                      width:
                        (s.count / Math.max(1, report.ticketCount)) * 100 + "%",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <h2>服务意图分布</h2>
          </div>
          <div className="risk-summary">
            {report.intents.map((i) => (
              <div key={i.intent}>
                <span>{labels[i.intent]}</span>
                <strong>{i.count}</strong>
              </div>
            ))}
          </div>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <h2>风险分类与失败执行</h2>
          </div>
          <div className="risk-summary">
            <div>
              <span>失败执行</span>
              <strong>{report.failures}</strong>
            </div>
            {Object.entries(report.riskTypes).map(([key, count]) => (
              <div key={key}>
                <span>{key}</span>
                <strong>{count}</strong>
              </div>
            ))}
          </div>
        </section>
      </div>
      <p className="muted">
        以上均为本演示空间的虚构业务记录，不代表企业真实经营指标或效率提升。
      </p>
    </>
  );
}
