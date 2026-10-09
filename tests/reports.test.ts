import { beforeEach, it, expect } from "vitest";
import { db, create, list } from "../src/lib/db";
import { parseQualityBatch, qualityReport } from "../src/lib/reports";
import { mockAppointments, syncMockCRM } from "../src/lib/integrations";
import {
  operation,
  workspaceState,
  exportTickets,
} from "../src/lib/operations";
import {
  seedKnowledge,
  saveDocument,
  searchKnowledge,
} from "../src/lib/knowledge";
import {
  draftResponse,
  extractServiceIntent,
  runResponseQualityCheck,
} from "../src/lib/rules";
import type { Context } from "../src/lib/types";
let ctx: Context;
it("exports only tickets matching clinic, UTC date and state", () => {
  const a = create(ctx, "ticket", {
    title: "应导出的前滩工单",
    clinic: "qiantan",
    status: "pending",
  });
  create(ctx, "ticket", {
    title: "不导出的古北工单",
    clinic: "gubei",
    status: "pending",
  });
  const today = a.createdAt.slice(0, 10);
  const filtered = exportTickets(
    ctx,
    new URLSearchParams({
      clinic: "qiantan",
      from: today,
      to: today,
      status: "pending",
    }),
  );
  expect(filtered).toContain("应导出");
  expect(filtered).not.toContain("不导出");
  expect(
    exportTickets(ctx, new URLSearchParams({ to: "2000-01-01" })),
  ).not.toContain(a.id);
});
beforeEach(() => {
  ctx = { workspace: crypto.randomUUID(), role: "admin" };
  db()
    .prepare("INSERT INTO workspaces VALUES(?,?)")
    .run(ctx.workspace, new Date().toISOString());
  seedKnowledge(ctx);
});
it("parses human-created TXT and JSON batch files", () => {
  expect(parseQualityBatch("保险需核实\r\n\r\n预约待确认")).toEqual([
    "保险需核实",
    "预约待确认",
  ]);
  expect(parseQualityBatch('["保险需核实",{"text":"预约待确认"}]')).toEqual([
    "保险需核实",
    "预约待确认",
  ]);
});
it.each([
  "",
  "[null]",
  '[{"wrong":"value"}]',
  '["unterminated"',
  JSON.stringify(Array(21).fill("虚构对话记录")),
])("rejects malformed or oversized batches: %s", (text) => {
  expect(() => parseQualityBatch(text)).toThrow();
});
it("exports only selected saved batch, including risk excerpts and review state", async () => {
  const batchId = crypto.randomUUID();
  await operation(ctx, "quality", { texts: ["保险肯定能报销"], batchId });
  await operation(ctx, "quality", { texts: ["其他批次服务回复"] });
  const report = qualityReport(ctx, batchId);
  expect(report).toContain("检查记录：1");
  expect(report).toContain("保险肯定能报销");
  expect(report).not.toContain("其他批次");
  expect(report).toContain("尚未复核");
  expect(report).toContain("模型审查：未运行");
});
it("does not leak another workspace into reports or mock appointments", async () => {
  await operation(ctx, "quality", { texts: ["本空间唯一记录"] });
  create(ctx, "appointment", { clinic: "qiantan" });
  const other = { ...ctx, workspace: crypto.randomUUID() };
  db()
    .prepare("INSERT INTO workspaces VALUES(?,?)")
    .run(other.workspace, new Date().toISOString());
  expect(qualityReport(other)).not.toContain("本空间唯一记录");
  expect(mockAppointments(other).items).toHaveLength(0);
});
it("denies unauthorized report export and mock CRM writes", () => {
  expect(() => qualityReport({ ...ctx, role: "service" })).toThrow("无权");
  expect(() =>
    syncMockCRM(
      { ...ctx, role: "reviewer" },
      { leadId: crypto.randomUUID(), key: crypto.randomUUID() },
    ),
  ).toThrow("无权");
});
it("removes restricted evidence from manager exports and state", () => {
  const doc = saveDocument(ctx, {
    title: "限阅质检资料",
    content: "限阅质检资料，仅供医疗审核员查看的虚构依据。",
    visibility: "reviewer",
  });
  const citations = searchKnowledge(ctx, "限阅质检资料").filter(
    (c) => c.documentId === doc.id,
  );
  create(
    ctx,
    "quality",
    runResponseQualityCheck("这是一条限阅检查", citations),
  );
  expect(qualityReport(ctx)).toContain("限阅检查");
  expect(qualityReport({ ...ctx, role: "manager" })).not.toContain("限阅检查");
  expect(workspaceState({ ...ctx, role: "manager" }).qualities).toHaveLength(0);
});
it("mock sync writes once and refuses cross-workspace leads", () => {
  const lead = create(ctx, "lead", { fictional: true });
  const p = { leadId: lead.id, key: crypto.randomUUID() };
  expect(syncMockCRM(ctx, p).id).toBe(syncMockCRM(ctx, p).id);
  expect(list(ctx, "integration")).toHaveLength(1);
  expect(syncMockCRM(ctx, p).data).toMatchObject({
    realSystemConnected: false,
    status: "synced_locally",
  });
  expect(() =>
    syncMockCRM({ ...ctx, workspace: crypto.randomUUID() }, p),
  ).toThrow();
});
it("answers English clinic inquiry using retrieved public evidence", () => {
  const input =
    "Could you tell me about rehabilitation services at Qiantan clinic?";
  const response = draftResponse(
    extractServiceIntent(input),
    searchKnowledge(ctx, input),
  );
  expect(response).toContain("Qiantan");
  expect(response).toContain("verify physical therapy services");
  expect(response).toContain("[");
  expect(response).not.toContain("confirmed booking");
});
it("acknowledges preferred English communication without promising staff", () => {
  const input = "我想预约前滩周六上午，希望英语沟通";
  expect(
    draftResponse(extractServiceIntent(input), searchKnowledge(ctx, input)),
  ).toContain("具体人员可用性须由客服核实");
});
