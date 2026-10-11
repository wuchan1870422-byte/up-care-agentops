import { beforeEach, expect, it } from "vitest";
import { db, create, get, list } from "../src/lib/db";
import {
  seedKnowledge,
  saveDocument,
  searchKnowledge,
} from "../src/lib/knowledge";
import { runConsultation } from "../src/lib/workflow";
import { decideApproval, executeTool } from "../src/lib/tools";
import type {
  Context,
  Document,
  Approval,
  Ticket,
  RecordRow,
} from "../src/lib/types";

let ctx: Context;
beforeEach(() => {
  ctx = { workspace: crypto.randomUUID(), role: "admin" };
  db()
    .prepare("INSERT INTO workspaces VALUES(?,?)")
    .run(ctx.workspace, new Date().toISOString());
  seedKnowledge(ctx);
});

it("content-only edits preserve restricted visibility and archived status", () => {
  const original = saveDocument(ctx, {
    title: "限阅虚构文档",
    content: "限阅虚构文档正文只允许审核角色查看。",
    visibility: "reviewer",
    active: false,
  });
  const updated = saveDocument(ctx, {
    id: original.id,
    title: original.data.title,
    content: "仅修改正文，仍是限阅且停用的虚构文档。",
    source: "",
  });
  expect(updated.data).toMatchObject({
    visibility: "reviewer",
    active: false,
    version: 2,
  });
  expect(
    searchKnowledge({ ...ctx, role: "service" }, "限阅虚构文档").some(
      (c) => c.documentId === original.id,
    ),
  ).toBe(false);
  expect(get<Document>(ctx, original.id).data.versions).toHaveLength(1);
});

it("idempotent consultation replay cannot return restricted citation content", async () => {
  saveDocument(ctx, {
    title: "星河限阅",
    content: "星河限阅规则；虚构访问标记 ONLY_REVIEWER_42。",
    visibility: "reviewer",
  });
  const input = { text: "星河限阅", key: crypto.randomUUID() };
  const first = await runConsultation(ctx, input);
  expect(
    first.data.citations.some((c) => c.content.includes("ONLY_REVIEWER_42")),
  ).toBe(true);
  await expect(
    runConsultation({ ...ctx, role: "service" }, input),
  ).rejects.toMatchObject({ status: 403 });
});

it("cannot append to a conversation hidden because of restricted evidence", async () => {
  saveDocument(ctx, {
    title: "星河限阅",
    content: "星河限阅规则；虚构访问标记 ONLY_REVIEWER_42。",
    visibility: "reviewer",
  });
  const first = await runConsultation(ctx, {
    text: "星河限阅",
    key: crypto.randomUUID(),
  });
  const count = list(ctx, "run").length;
  await expect(
    runConsultation(
      { ...ctx, role: "service" },
      {
        text: "继续咨询",
        conversationId: first.data.conversationId,
        key: crypto.randomUUID(),
      },
    ),
  ).rejects.toMatchObject({ status: 403 });
  expect(list(ctx, "run")).toHaveLength(count);
});

it("duplicate approval requests cannot reset a completed ticket", () => {
  const ticket = executeTool(ctx, "createServiceTicket", {
    title: "虚构状态回归工单",
    key: crypto.randomUUID(),
  }) as RecordRow<Ticket>;
  const request = {
    targetId: ticket.id,
    targetKind: "ticket",
    reason: "虚构服务审核",
    key: crypto.randomUUID(),
  };
  const first = executeTool(
    ctx,
    "requestHumanReview",
    request,
  ) as RecordRow<Approval>;
  const second = executeTool(ctx, "requestHumanReview", {
    ...request,
    key: crypto.randomUUID(),
  }) as RecordRow<Approval>;
  expect(second.id).toBe(first.id);
  decideApproval(ctx, {
    id: first.id,
    decision: "approved",
    note: "虚构审核通过",
  });
  executeTool(ctx, "updateTicketStatus", {
    id: ticket.id,
    status: "in_progress",
  });
  executeTool(ctx, "updateTicketStatus", {
    id: ticket.id,
    status: "completed",
  });
  expect(() =>
    decideApproval(ctx, {
      id: second.id,
      decision: "rejected",
      note: "不能重置完成状态",
    }),
  ).toThrow();
  expect(get<Ticket>(ctx, ticket.id).data.status).toBe("completed");
});

it("legacy pending approvals cannot overwrite a target that has advanced", () => {
  const target = create(ctx, "ticket", {
    title: "虚构旧数据工单",
    status: "completed",
  });
  const old = create<Approval>(ctx, "approval", {
    targetId: target.id,
    targetKind: "ticket",
    status: "pending",
    reason: "旧审核记录",
  });
  expect(() =>
    decideApproval(ctx, {
      id: old.id,
      decision: "rejected",
      note: "旧请求应被拒绝",
    }),
  ).toThrow("目标");
  expect(get<{ status: string }>(ctx, target.id).data.status).toBe("completed");
  expect(get<Approval>(ctx, old.id).data.status).toBe("pending");
});
