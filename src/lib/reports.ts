import { z } from "zod";
import { authorize, list, audit } from "./repository";
import { textSchema } from "./rules";
import { accessibleDocuments } from "./knowledge";
import type { Context, Quality } from "./types";
export function parseQualityBatch(content: string) {
  const trimmed = content.trim();
  let texts: unknown;
  if (trimmed.startsWith("[")) {
    const parsed: unknown = JSON.parse(trimmed);
    texts = Array.isArray(parsed)
      ? parsed.map((item) =>
          typeof item === "string"
            ? item
            : typeof item === "object" && item !== null && "text" in item
              ? item.text
              : item,
        )
      : parsed;
  } else
    texts = trimmed
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
  return z.array(textSchema).min(1).max(20).parse(texts);
}
export function qualityReport(ctx: Context, batchId?: string) {
  authorize(ctx, ["reviewer", "manager", "admin"]);
  const allowed = new Set(accessibleDocuments(ctx).map((d) => d.id));
  const records = list<Quality & { batchId?: string }>(ctx, "quality").filter(
    (r) =>
      (!batchId || r.data.batchId === batchId) &&
      r.data.citations.every((c) => allowed.has(c.documentId)),
  );
  const risks = records.flatMap((r) => r.data.risks);
  const counts = risks.reduce<Record<string, number>>(
    (acc, r) => ({ ...acc, [r.type]: (acc[r.type] ?? 0) + 1 }),
    {},
  );
  audit(ctx, "quality.report_exported", "", {
    count: records.length,
    batchId: batchId ?? null,
  });
  return [
    "UP-Care AgentOps — 虚构服务沟通质检报告",
    "Independent Concept Demo / 非官方概念演示",
    `生成时间：${new Date().toISOString()}`,
    `检查记录：${records.length}；风险条目：${risks.length}；待复核：${records.filter((r) => r.data.status === "pending").length}`,
    "规则审查结果，不是医学诊断或医疗合规认证；模型审查：未运行。",
    "",
    ...Object.entries(counts).map(([type, count]) => `${type}: ${count}`),
    "",
    ...records.flatMap((row, i) => [
      `${i + 1}. ${row.id} | ${row.createdAt} | ${row.data.status}`,
      "原始回复：" + row.data.text,
      ...row.data.risks.map(
        (r) =>
          `[${r.severity}] ${r.type}\n片段：${r.excerpt}\n理由：${r.reason}\n建议：${r.suggestion}`,
      ),
      "待审核修改稿：" + row.data.revised,
      "资料：" +
        row.data.citations
          .map((c) => `${c.title} v${c.version} ${c.source || "虚构演示规范"}`)
          .join("；"),
      "人工复核：" + (row.data.reviewerNote || "尚未复核"),
      "",
    ]),
  ].join("\n");
}
