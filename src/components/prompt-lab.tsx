"use client";
import { useState } from "react";
import { api } from "@/lib/transport";
import type { promptLabState } from "@/lib/prompt-lab";
export function PromptLab({
  data,
  onComplete,
}: {
  data: ReturnType<typeof promptLabState>;
  onComplete: () => Promise<void>;
}) {
  const [template, setTemplate] = useState(
      data.prompts[0]?.data.template ?? "{{draft}}",
    ),
    [name, setName] = useState("服务回复模板"),
    [note, setNote] = useState("保留完整规则草稿和人工核实边界"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function perform(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      await onComplete();
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }
  const latest = data.evaluations[0],
    previous = latest
      ? data.evaluations.find(
          (e) =>
            e.data.promptId !== latest.data.promptId &&
            e.data.datasetVersion === latest.data.datasetVersion,
        )
      : undefined;
  return (
    <div className="two-column">
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Prompt 模板版本</h2>
            <p>
              独立实验空间：模板不会自动应用到咨询流程。编辑和运行需管理员或医疗审核员。
            </p>
          </div>
        </div>
        <form
          className="form-content"
          onSubmit={(e) => {
            e.preventDefault();
            void perform(() =>
              api("prompt", {
                name,
                template,
                note,
                parentId: data.prompts[0]?.id,
              }),
            );
          }}
        >
          <label>
            模板名称
            <input
              aria-label="模板名称"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              required
            />
          </label>
          <label>
            回复模板
            <textarea
              aria-label="回复模板"
              rows={8}
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              maxLength={1500}
              required
            />
          </label>
          <p className="muted">
            {
              "必须包含一次 {{draft}}；可用 {{language}}。变量只做文本替换，不执行代码。"
            }
          </p>
          <label>
            版本说明
            <input
              aria-label="版本说明"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              minLength={3}
              maxLength={500}
              required
            />
          </label>
          <button disabled={busy} type="submit">
            保存模板新版本
          </button>
          {error && (
            <p className="alert error" role="alert">
              {error}
            </p>
          )}
        </form>
        <div className="form-content">
          {data.prompts.map((p) => (
            <article key={p.id} className="document">
              <h3>
                {p.data.name} · v{p.data.version}
              </h3>
              <p>{p.data.note}</p>
              <pre>{p.data.template}</pre>
              <div className="actions">
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() =>
                    void perform(() => api("prompt/evaluate", { id: p.id }))
                  }
                >
                  检查模板 v{p.data.version}
                </button>
                <button
                  className="secondary"
                  onClick={() => {
                    setTemplate(p.data.template);
                    setName(p.data.name);
                    setNote("基于 v" + p.data.version + " 修改");
                  }}
                >
                  载入编辑
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>模板回归与版本对比</h2>
            <p>
              template-safety-v1 · 6
              条固定案例。仅检查保留规则草稿和已知表达风险，未调用模型，不代表语义质量或医疗有效性。
            </p>
          </div>
        </div>
        <div className="form-content">
          {latest && (
            <div className="info-box">
              最新 v{latest.data.promptVersion}：{latest.data.passed}/
              {latest.data.total}；
              {previous
                ? `对比 v${previous.data.promptVersion}：通过项变化 ${latest.data.passed - previous.data.passed >= 0 ? "+" : ""}${latest.data.passed - previous.data.passed}`
                : "保存并检查另一版本后显示差异"}
            </div>
          )}
          {!data.evaluations.length && (
            <p className="muted">
              保存模板后运行检查，这里将显示实际输出、风险和执行时间。
            </p>
          )}
          {data.evaluations.map((e) => (
            <details className="eval-details" key={e.id}>
              <summary>
                模板 v{e.data.promptVersion} · {e.data.passed}/{e.data.total} ·{" "}
                {e.data.durationMs.toFixed(1)} ms
              </summary>
              <p>
                {new Date(e.createdAt).toLocaleString("zh-CN")} ·{" "}
                {e.data.datasetVersion} · modelCalled: false
              </p>
              {e.data.cases.map((c) => (
                <div className="document" key={c.id}>
                  <strong>
                    {c.id} · {c.passed ? "通过" : "发现风险"}
                  </strong>
                  <p>{c.input}</p>
                  <pre>{c.output}</pre>
                  {c.risks.length > 0 && (
                    <p className="alert error">{c.risks.join("、")}</p>
                  )}
                </div>
              ))}
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
