const randomUUID = () => crypto.randomUUID();
import { z } from "zod";
import {
  AppError,
  audit,
  authorize,
  create,
  get,
  idempotent,
  list,
  update,
} from "./repository";
import { executeTool, type ToolName } from "./tools";
import { draftResponse, runResponseQualityCheck, textSchema } from "./rules";
import { assertConversationReadable, assertRunReadable } from "./knowledge";
import type {
  Citation,
  Context,
  Conversation,
  Intent,
  NodeEvent,
  Quality,
  RecordRow,
  Run,
  Ticket,
} from "./types";
export const runSchema = z.object({
  text: textSchema,
  conversationId: z.string().uuid().optional(),
  key: z.string().min(8).max(200),
  retryOf: z.string().uuid().optional(),
});
export async function runConsultation(
  ctx: Context,
  input: unknown,
  onProgress?: (run: RecordRow<Run>) => void,
  options: { beforeStep?: (tool: string) => void; maxDurationMs?: number } = {},
) {
  authorize(ctx, ["service", "operator", "admin"]);
  const p = runSchema.parse(input);
  if (p.conversationId) assertConversationReadable(ctx, p.conversationId);
  if (p.retryOf) {
    const old = get<Run>(ctx, p.retryOf, "run");
    assertRunReadable(ctx, old.data);
    if (old.data.status !== "failed")
      throw new AppError("仅可重试失败执行", 409);
    if (
      p.text !== old.data.input ||
      p.conversationId !== old.data.conversationId
    )
      throw new AppError("重试必须保持原始输入和会话", 409);
  }
  const reservation = idempotent(ctx, "run:" + p.key, JSON.stringify(p), () => {
    const conv = p.conversationId
      ? get<Conversation>(ctx, p.conversationId, "conversation")
      : create<Conversation>(ctx, "conversation", {
          title: p.text.slice(0, 60),
          messages: [],
        });
    const run = create<Run>(ctx, "run", {
      conversationId: conv.id,
      input: p.text,
      mode: "demo",
      status: "running",
      nodes: [],
      citations: [],
      promptVersion: "rules-2.0",
      retryOf: p.retryOf,
    });
    if (!p.retryOf)
      update(ctx, conv.id, {
        ...conv.data,
        messages: [
          ...conv.data.messages,
          { role: "user", text: p.text, at: new Date().toISOString() },
        ],
      });
    return { runId: run.id, conversationId: conv.id };
  });
  const row = get<Run>(ctx, reservation.runId, "run");
  assertRunReadable(ctx, row.data);
  assertConversationReadable(ctx, row.data.conversationId);
  if (row.data.nodes.length || row.data.status !== "running") return row;
  const run = row.data,
    started = performance.now();
  let effectId = row.id;
  for (let previous = p.retryOf; previous;) {
    const old = get<Run>(ctx, previous, "run");
    effectId = old.id;
    previous = old.data.retryOf;
  }
  let steps = 0;
  const save = () => {
    const saved = update(ctx, row.id, run);
    onProgress?.(structuredClone(saved));
    return saved;
  };
  const step = async <T>(
    name: string,
    tool: ToolName | "draftResponse" | "validateFields",
    args: unknown,
    fn: () => T,
  ): Promise<T> => {
    ++steps;
    const event: NodeEvent = {
      id: randomUUID(),
      name,
      status: "running",
      tool,
      startedAt: new Date().toISOString(),
      input: args,
    };
    run.nodes.push(event);
    save();
    const at = performance.now();
    try {
      if (
        steps > 12 ||
        performance.now() - started > (options.maxDurationMs ?? 15000)
      )
        throw new AppError("执行超过步数或时间限制", 408);
      options.beforeStep?.(tool);
      const output = fn();
      event.status = "completed";
      event.output = output;
      event.durationMs = performance.now() - at;
      event.endedAt = new Date().toISOString();
      save();
      return output;
    } catch (e) {
      event.status = "failed";
      event.error = e instanceof Error ? e.message : "执行失败";
      event.endedAt = new Date().toISOString();
      event.durationMs = performance.now() - at;
      save();
      throw e;
    }
  };
  try {
    const conv = get<Conversation>(
      ctx,
      reservation.conversationId,
      "conversation",
    );
    const context = conv.data.messages
      .filter((m) => m.role === "user")
      .slice(-6)
      .map((m) => m.text)
      .join("\n")
      .slice(-8000);
    run.intent = await step(
      "Intent Detection & Entity Extraction",
      "extractServiceIntent",
      { text: context },
      () =>
        executeTool(ctx, "extractServiceIntent", { text: context }) as Intent,
    );
    run.citations = await step(
      "Knowledge Retrieval",
      "searchKnowledge",
      { query: context.slice(-2000) },
      () =>
        executeTool(ctx, "searchKnowledge", {
          query: context.slice(-2000),
        }) as Citation[],
    );
    run.draft = await step(
      "Response Drafting",
      "draftResponse",
      { intent: run.intent, citations: run.citations.map((c) => c.documentId) },
      () => draftResponse(run.intent!, run.citations),
    );
    const quality = await step(
      "Quality Review",
      "runResponseQualityCheck",
      { text: run.draft },
      () => {
        const data = runResponseQualityCheck(
          run.draft,
          run.citations,
          run.intent!.clinic,
        );
        const result = create<Quality>(ctx, "quality", data);
        audit(ctx, "quality.created", result.id);
        return result;
      },
    );
    run.qualityId = quality.id;
    const valid = await step(
      "Field Validation",
      "validateFields",
      run.intent,
      () => ({
        ready:
          run.intent!.intent === "appointment" &&
          !run.intent!.missing.length &&
          !run.intent!.escalation,
        missing: run.intent!.missing,
      }),
    );
    if (valid.ready) {
      await step(
        "Service Lead",
        "createServiceLead",
        { conversationId: reservation.conversationId },
        () =>
          executeTool(ctx, "createServiceLead", {
            conversationId: reservation.conversationId,
            intent: run.intent,
            key: effectId + ":lead",
          }),
      );
      await step(
        "Appointment Intent",
        "createAppointmentIntent",
        run.intent,
        () =>
          executeTool(ctx, "createAppointmentIntent", {
            intent: run.intent,
            conversationId: reservation.conversationId,
            key: effectId + ":appointment",
          }),
      );
    }
    if (valid.ready || run.intent.escalation) {
      const ticket = await step(
        "Ticket Creation",
        "createServiceTicket",
        { clinic: run.intent.clinic },
        () =>
          executeTool(ctx, "createServiceTicket", {
            title:
              (run.intent!.escalation ? "专业人工审核：" : "预约意向：") +
              p.text.slice(0, 100),
            clinic: run.intent!.clinic,
            priority: run.intent!.escalation ? "high" : "normal",
            runId: effectId,
            conversationId: reservation.conversationId,
            intent: run.intent,
            key: effectId + ":ticket",
          }) as RecordRow<Ticket>,
      );
      run.ticketId = ticket.id;
      await step(
        "Follow-up Task",
        "createFollowUpTask",
        { ticketId: ticket.id },
        () =>
          executeTool(ctx, "createFollowUpTask", {
            ticketId: ticket.id,
            summary: "核实虚构预约意向、服务语言与保险问题；不发送外部通知。",
            key: effectId + ":followup",
          }),
      );
      const approval = executeTool(ctx, "requestHumanReview", {
        targetId: ticket.id,
        targetKind: "ticket",
        reason: run.intent.escalation
          ? "需要专业判断"
          : "核实预约意向，不代表真实预约",
        key: effectId + ":approval",
      }) as RecordRow;
      run.approvalId = approval.id;
      run.nodes.push({
        id: randomUUID(),
        name: "Human Approval",
        status: "waiting",
        startedAt: new Date().toISOString(),
        tool: "requestHumanReview",
        input: { approvalId: approval.id },
        output: { status: "pending" },
      });
      run.status = "awaiting_approval";
    } else run.status = "completed";
    const current = get<Conversation>(
      ctx,
      reservation.conversationId,
      "conversation",
    );
    update(ctx, current.id, {
      ...current.data,
      messages: [
        ...current.data.messages,
        {
          role: "assistant",
          text: quality.data.revised,
          at: new Date().toISOString(),
        },
      ],
    });
    run.durationMs = performance.now() - started;
    save();
    executeTool(ctx, "saveAgentTrace", { runId: row.id, summary: run.status });
    return get<Run>(ctx, row.id, "run");
  } catch (e) {
    run.status = "failed";
    run.error = e instanceof Error ? e.message : "工作流执行失败";
    run.durationMs = performance.now() - started;
    save();
    audit(ctx, "workflow.failed", row.id, { error: run.error });
    return get<Run>(ctx, row.id, "run");
  }
}
export const workflowDefinitions = [
  {
    id: "A",
    name: "患者咨询处理",
    nodes: ["意图提取", "知识检索", "回复草稿", "质检", "条件转人工"],
  },
  {
    id: "B",
    name: "预约意向自动化",
    nodes: ["预约识别", "字段校验", "意向登记", "工单", "人工确认"],
  },
  {
    id: "D",
    name: "批量客服质检",
    nodes: ["导入文本", "规则风险识别", "修改建议", "人工审核"],
  },
  {
    id: "C",
    name: "随访信息辅助",
    nodes: ["记录导入", "原文摘要", "跟进任务", "人工确认"],
  },
  {
    id: "E",
    name: "知识库更新",
    nodes: ["文档导入", "文本分块", "关键词索引", "检索验证"],
  },
];
export function dashboard(ctx: Context) {
  const tickets = list<Ticket>(ctx, "ticket"),
    runs = list<Run>(ctx, "run"),
    qualities = list<Quality>(ctx, "quality");
  return {
    conversations: list(ctx, "conversation").length,
    tickets: tickets.length,
    pending: tickets.filter((t) => t.data.status === "pending").length,
    completed: tickets.filter((t) => t.data.status === "completed").length,
    appointments: list(ctx, "appointment").length,
    approvals: list(ctx, "approval").filter((a) => a.data.status === "pending")
      .length,
    qualityIssues: qualities.reduce((n, q) => n + q.data.risks.length, 0),
    runs: runs.length,
    successRate: runs.length
      ? Math.round(
          (runs.filter((r) =>
            ["completed", "awaiting_approval"].includes(r.data.status),
          ).length /
            runs.length) *
            100,
        )
      : null,
    meanLatency: runs.length
      ? Math.round(
          runs.reduce((n, r) => n + (r.data.durationMs ?? 0), 0) / runs.length,
        )
      : null,
    clinics: ["qiantan", "jingan", "gubei", "xintiandi"].map((id) => ({
      id,
      count: tickets.filter((t) => t.data.clinic === id).length,
    })),
    riskTypes: qualities
      .flatMap((q) => q.data.risks)
      .reduce<Record<string, number>>(
        (a, r) => ({ ...a, [r.type]: (a[r.type] ?? 0) + 1 }),
        {},
      ),
  };
}
