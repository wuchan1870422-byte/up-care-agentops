"use client";
import { useState } from "react";
import { Upload, Download } from "lucide-react";
import { api, downloadQualityReport } from "@/lib/transport";
import { parseQualityBatch } from "@/lib/reports";
export function QualityBatch({
  onComplete,
}: {
  onComplete: () => Promise<void>;
}) {
  const [progress, setProgress] = useState<{
      done: number;
      total: number;
    } | null>(null),
    [error, setError] = useState(""),
    [batchId, setBatchId] = useState<string>();
  const [running, setRunning] = useState(false);
  async function importFile(file: File) {
    setError("");
    if (file.size > 200000) {
      setError("批量文件上限 200KB");
      return;
    }
    setRunning(true);
    try {
      const texts = parseQualityBatch(await file.text()),
        id = crypto.randomUUID();
      setBatchId(id);
      setProgress({ done: 0, total: texts.length });
      for (let i = 0; i < texts.length; i++) {
        await api("quality", { texts: [texts[i]], batchId: id });
        setProgress({ done: i + 1, total: texts.length });
      }
      await onComplete();
    } catch (e) {
      setError(e instanceof Error ? e.message : "导入失败；已完成的记录仍保留");
      setProgress(null);
      await onComplete().catch(() => {});
    } finally {
      setRunning(false);
    }
  }
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>批量文件与管理报告</h2>
          <p>
            最多 20 条虚构对话；TXT 每行一条，或 JSON
            字符串数组。进度来自已保存的检查结果。
          </p>
        </div>
      </div>
      <div className="form-content">
        <div className="actions">
          <label className="upload button secondary">
            <Upload size={15} />
            导入虚构对话文件
            <input
              aria-label="导入质检文件"
              type="file"
              accept=".txt,.json"
              disabled={running}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void importFile(file);
                e.target.value = "";
              }}
            />
          </label>
          <button
            className="secondary"
            disabled={running}
            onClick={() =>
              void downloadQualityReport(batchId).catch((e) =>
                setError(e.message),
              )
            }
          >
            <Download size={15} />
            {batchId ? "导出本批次报告" : "导出全部质检报告"}
          </button>
        </div>
        {progress && (
          <div className="info-box" role="status">
            已保存 {progress.done} / {progress.total} 条检查结果{" "}
            <progress
              aria-label="批量质检进度"
              value={progress.done}
              max={progress.total}
            />
          </div>
        )}
        {error && (
          <p role="alert" className="alert error">
            {error}
          </p>
        )}
        <p className="muted">
          导出需医疗审核员、管理者或管理员角色。只生成报告文件，不发送给外部人员。
        </p>
      </div>
    </section>
  );
}
