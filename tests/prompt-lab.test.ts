import { beforeEach, it, expect } from "vitest";
import { db, get } from "../src/lib/db";
import {
  savePromptTemplate,
  evaluatePromptTemplate,
  renderTemplate,
  promptLabState,
  type PromptTemplate,
} from "../src/lib/prompt-lab";
import { seedKnowledge } from "../src/lib/knowledge";
import type { Context } from "../src/lib/types";
let ctx: Context;
const input = {
  name: "服务回复模板",
  template: "{{draft}}",
  note: "初始版本草稿",
};
beforeEach(() => {
  ctx = { workspace: crypto.randomUUID(), role: "admin" };
  db()
    .prepare("INSERT INTO workspaces VALUES(?,?)")
    .run(ctx.workspace, new Date().toISOString());
  seedKnowledge(ctx);
});
it("preserves immutable versions and rejects stale edits", () => {
  const first = savePromptTemplate(ctx, input);
  const second = savePromptTemplate(ctx, {
    ...input,
    parentId: first.id,
    template: "欢迎咨询。\n{{draft}}",
  });
  expect(second.data.version).toBe(2);
  expect(get<PromptTemplate>(ctx, first.id).data.template).toBe("{{draft}}");
  expect(() =>
    savePromptTemplate(ctx, { ...input, parentId: first.id }),
  ).toThrow("新版本");
});
it.each(["完全删除草稿的模板", "{{draft}} {{draft}}", "{{draft}} {{secrets}}"])(
  "rejects unsafe template variables %s",
  (template) => {
    expect(() => savePromptTemplate(ctx, { ...input, template })).toThrow();
  },
);
it("inserts variable content literally without recursive substitution", () => {
  expect(
    renderTemplate("{{language}}: {{draft}}", "literal {{language}} $&", "zh"),
  ).toBe("zh: literal {{language}} $&");
});
it("measures actual regression when a template introduces unsafe promises", () => {
  const first = savePromptTemplate(ctx, input),
    a = evaluatePromptTemplate(ctx, { id: first.id });
  const second = savePromptTemplate(ctx, {
      ...input,
      parentId: first.id,
      template: "{{draft}}\n保险肯定能报销。",
    }),
    b = evaluatePromptTemplate(ctx, { id: second.id });
  expect(a.data.passed).toBe(a.data.total);
  expect(b.data.passed).toBeLessThan(a.data.passed);
  expect(b.data.modelCalled).toBe(false);
  expect(b.data.cases[0].output).toContain("保险肯定能报销");
  expect(b.data.cases[0].risks.length).toBeGreaterThan(0);
});
it("isolates prompt records and disallows service staff writes", () => {
  const first = savePromptTemplate(ctx, input);
  expect(() => savePromptTemplate({ ...ctx, role: "service" }, input)).toThrow(
    "无权",
  );
  expect(() =>
    evaluatePromptTemplate(
      { ...ctx, workspace: crypto.randomUUID() },
      { id: first.id },
    ),
  ).toThrow("不存在");
  expect(
    promptLabState({ ...ctx, workspace: crypto.randomUUID() }).prompts,
  ).toHaveLength(0);
});
