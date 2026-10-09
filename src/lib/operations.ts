import { analytics } from "./analytics";
import {
  savePromptTemplate,
  evaluatePromptTemplate,
  promptLabState,
} from "./prompt-lab";
import { syncMockCRM } from "./integrations";
import { z } from "zod";
import {
  AppError,
  audit,
  auditList,
  authorize,
  create,
  db,
  get,
  list,
  transaction,
  update,
} from "./repository";
import {
  accessibleDocuments,
  saveDocument,
  searchKnowledge,
} from "./knowledge";
import { dashboard, runConsultation, workflowDefinitions } from "./workflow";
import { decideApproval, executeTool } from "./tools";
import { runResponseQualityCheck, soapDraft, textSchema } from "./rules";
import { saveEvaluation } from "./evaluation";
import type { Context, Quality, RecordRow, Ticket, Run } from "./types";

export function workspaceState(
  ctx: Context,
  storage: "sqlite" | "browser" = "sqlite",
) {
  const restricted = new Set(
    list<{ visibility: string }>(ctx, "document")
      .filter(
        (d) =>
          d.data.visibility === "reviewer" &&
          !["reviewer", "admin"].includes(ctx.role),
      )
      .map((d) => d.id),
  );
  const runs = list<Run>(ctx, "run").filter(
    (r) => !r.data.citations.some((c) => restricted.has(c.documentId)),
  );
  const hiddenConversations = new Set(
    list<Run>(ctx, "run")
      .filter((r) => r.data.citations.some((c) => restricted.has(c.documentId)))
      .map((r) => r.data.conversationId),
  );
  return {
    promptLab: promptLabState(ctx),
    role: ctx.role,
    workspace: ctx.workspace,
    mode: "demo",
    storage,
    analytics: analytics(ctx),
    dashboard: dashboard(ctx),
    conversations: list(ctx, "conversation").filter(
      (c) => !hiddenConversations.has(c.id),
    ),
    runs,
    tickets: list(ctx, "ticket"),
    appointments: list(ctx, "appointment"),
    customers: list(ctx, "customer"),
    leads: list(ctx, "lead"),
    integrations: list(ctx, "integration"),
    approvals: list(ctx, "approval"),
    qualities: list<Quality>(ctx, "quality").filter(
      (q) => !q.data.citations.some((c) => restricted.has(c.documentId)),
    ),
    documents: accessibleDocuments(ctx),
    followups: list(ctx, "followup"),
    notes: ["reviewer", "admin"].includes(ctx.role) ? list(ctx, "note") : [],
    evaluations: list(ctx, "evaluation"),
    audit: auditList(ctx),
    workflows: workflowDefinitions,
  };
}
export function exportTickets(
  ctx: Context,
  params: URLSearchParams = new URLSearchParams(),
) {
  authorize(ctx, ["manager", "admin"]);
  const tickets = list<Ticket>(ctx, "ticket").filter(
    (t) =>
      (!params.get("status") || t.data.status === params.get("status")) &&
      (!params.get("clinic") || t.data.clinic === params.get("clinic")) &&
      (!params.get("from") ||
        t.createdAt.slice(0, 10) >= params.get("from")!) &&
      (!params.get("to") || t.createdAt.slice(0, 10) <= params.get("to")!),
  );
  const safe = (v: unknown) =>
    '"' +
    String(v ?? "")
      .replace(/^[\s]*[=+@\-]/, "'$&")
      .replaceAll('"', '""') +
    '"';
  audit(ctx, "tickets.exported", "", { count: tickets.length });
  return (
    "\uFEFF" +
    [
      "id,title,clinic,status,created_at",
      ...tickets.map((t) =>
        [t.id, t.data.title, t.data.clinic, t.data.status, t.createdAt]
          .map(safe)
          .join(","),
      ),
    ].join("\r\n")
  );
}
export async function operation(
  ctx: Context,
  path: string,
  raw: unknown,
  onProgress?: (run: RecordRow<Run>) => void,
) {
  const count = db()
    .prepare("SELECT count(*) AS n FROM records WHERE workspace=?")
    .get(ctx.workspace) as { n: number };
  if (count.n >= 2000)
    throw new AppError("本演示空间已达容量上限，请新建演示空间", 429);
  const body = z.record(z.string(), z.unknown()).parse(raw);
  switch (path) {
    case "prompt":
      return savePromptTemplate(ctx, body);
    case "prompt/evaluate":
      return evaluatePromptTemplate(ctx, body);
    case "mock/crm/sync":
      return syncMockCRM(ctx, body);
    case "consult":
      return runConsultation(ctx, body, onProgress);
    case "approve":
      return decideApproval(ctx, body);
    case "ticket":
      return executeTool(ctx, "createServiceTicket", body);
    case "ticket/status":
      return executeTool(ctx, "updateTicketStatus", body);
    case "ticket/assign": {
      authorize(ctx, ["operator", "manager", "admin"]);
      const p = z
        .object({
          id: z.string().uuid(),
          assignedTo: z.string().trim().min(1).max(100),
          note: z.string().max(1000).default(""),
        })
        .parse(body);
      return transaction(() => {
        const row = get<Ticket>(ctx, p.id, "ticket");
        const result = update(ctx, row.id, {
          ...row.data,
          assignedTo: p.assignedTo,
          notes: [...row.data.notes, ...(p.note ? [p.note] : [])],
        });
        audit(ctx, "ticket.assigned", row.id, { assignedTo: p.assignedTo });
        return result;
      });
    }
    case "quality": {
      authorize(ctx, ["service", "operator", "reviewer", "admin"]);
      const p = z
        .object({
          texts: z.array(textSchema).min(1).max(20),
          batchId: z.string().uuid().optional(),
        })
        .parse(body);
      return transaction(() =>
        p.texts.map((text) => {
          const citations = searchKnowledge(ctx, "客服 医疗 保险 规范");
          const row = create(ctx, "quality", {
            ...runResponseQualityCheck(text, citations),
            batchId: p.batchId,
          });
          audit(ctx, "quality.created", row.id, {
            riskCount: row.data.risks.length,
          });
          return row;
        }),
      );
    }
    case "quality/review": {
      authorize(ctx, ["reviewer", "admin"]);
      const p = z
        .object({
          id: z.string().uuid(),
          note: z.string().trim().min(2).max(2000),
        })
        .parse(body);
      const row = get<Quality>(ctx, p.id, "quality");
      const result = update(ctx, row.id, {
        ...row.data,
        status: "reviewed",
        reviewerNote: p.note,
      });
      audit(ctx, "quality.reviewed", row.id, { previous: row.data.status });
      return result;
    }
    case "document":
      return saveDocument(ctx, body);
    case "document/archive": {
      authorize(ctx, ["admin", "reviewer"]);
      const { id } = z.object({ id: z.string().uuid() }).parse(body);
      const d = get<import("./types").Document>(ctx, id, "document");
      const result = saveDocument(ctx, {
        id,
        title: d.data.title,
        content: d.data.content,
        source: d.data.source,
        visibility: d.data.visibility,
        active: false,
      });
      audit(ctx, "knowledge.archived", id);
      return result;
    }
    case "evaluate":
      authorize(ctx, ["manager", "admin"]);
      return saveEvaluation(ctx);
    case "followup": {
      authorize(ctx, ["operator", "reviewer", "admin"]);
      const p = z
        .object({ text: textSchema, key: z.string().min(8).max(100) })
        .parse(body);
      const lines = p.text.split(/\n/).filter(Boolean);
      const unresolved = lines.filter((s) =>
        /待|仍|未|问题|疼|痛|pending|still|pain|question/i.test(s),
      );
      const ticket = executeTool(ctx, "createServiceTicket", {
        title: "随访跟进：" + p.text.slice(0, 100),
        priority: "high",
        key: p.key + ":ticket",
      }) as RecordRow<Ticket>;
      const task = executeTool(ctx, "createFollowUpTask", {
        ticketId: ticket.id,
        summary: lines.slice(-3).join("\n"),
        key: p.key + ":task",
      }) as RecordRow;
      executeTool(ctx, "requestHumanReview", {
        targetId: ticket.id,
        targetKind: "ticket",
        reason: "核实原文中的未解决事项，需要时转专业人员",
        key: p.key + ":approval",
      });
      return update(ctx, task.id, {
        ...task.data,
        records: lines,
        unresolved,
        draft:
          "请由服务人员核实待跟进事项。涉及症状判断的部分交由专业人员处理。",
        summaryMethod: "原文摘录，非模型总结",
      });
    }
    case "followup/status": {
      authorize(ctx, ["operator", "reviewer", "admin"]);
      const p = z
        .object({
          id: z.string().uuid(),
          status: z.enum(["pending", "completed"]),
        })
        .parse(body);
      const task = get<Record<string, unknown>>(ctx, p.id, "followup");
      const result = update(ctx, p.id, { ...task.data, status: p.status });
      audit(ctx, "followup." + p.status, p.id);
      return result;
    }
    case "soap": {
      authorize(ctx, ["reviewer", "admin"]);
      const p = z.object({ text: textSchema }).parse(body);
      const note = create(ctx, "note", soapDraft(p.text));
      executeTool(ctx, "requestHumanReview", {
        targetId: note.id,
        targetKind: "note",
        reason: "未经专业人员审核的事实整理草稿",
        key: note.id + ":approval",
      });
      return note;
    }
    default:
      throw new AppError("接口不存在", 404);
  }
}
