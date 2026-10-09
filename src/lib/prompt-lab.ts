import { z } from "zod";
import {
  AppError,
  authorize,
  audit,
  create,
  get,
  list,
  transaction,
} from "./repository";
import {
  draftResponse,
  extractServiceIntent,
  runResponseQualityCheck,
} from "./rules";
import { searchKnowledge } from "./knowledge";
import type { Context, RecordRow } from "./types";

export type PromptTemplate = {
  version: number;
  name: string;
  template: string;
  note: string;
  parentId?: string;
};
export type TemplateEvaluation = {
  promptId: string;
  promptVersion: number;
  datasetVersion: string;
  mode: "template-rules";
  modelCalled: false;
  total: number;
  passed: number;
  durationMs: number;
  cases: {
    id: string;
    input: string;
    output: string;
    risks: string[];
    passed: boolean;
  }[];
};
const schema = z.object({
  name: z.string().trim().min(2).max(80),
  template: z.string().trim().min(9).max(1500),
  note: z.string().trim().min(3).max(500),
  parentId: z.string().uuid().optional(),
});
export function renderTemplate(
  template: string,
  draft: string,
  language: string,
) {
  return template.replace(/\{\{(draft|language)\}\}/g, (_, key: string) =>
    key === "draft" ? draft : language,
  );
}
export function savePromptTemplate(ctx: Context, input: unknown) {
  authorize(ctx, ["admin", "reviewer"]);
  const p = schema.parse(input);
  const tokens = p.template.match(/\{\{[^{}]*\}\}/g) ?? [];
  if (
    tokens.filter((t) => t === "{{draft}}").length !== 1 ||
    tokens.some((t) => !["{{draft}}", "{{language}}"].includes(t))
  )
    throw new AppError(
      "模板必须且只能包含一次 {{draft}}；其他变量仅支持 {{language}}",
      400,
    );
  return transaction(() => {
    const latest = list<PromptTemplate>(ctx, "prompt")[0];
    if ((latest?.id ?? undefined) !== p.parentId)
      throw new AppError("模板已有新版本，请刷新后再保存", 409);
    const row = create<PromptTemplate>(ctx, "prompt", {
      ...p,
      version: (latest?.data.version ?? 0) + 1,
    });
    audit(ctx, "prompt.version_created", row.id, { version: row.data.version });
    return row;
  });
}
const fixtures = [
  { id: "appointment-zh", input: "我想预约前滩周六上午" },
  {
    id: "clinic-en",
    input: "Could you tell me about rehabilitation services at Qiantan clinic?",
  },
  { id: "insurance", input: "商业保险可以报销吗" },
  { id: "medical-escalation", input: "请诊断我的膝盖疼痛并制定治疗方案" },
  { id: "missing-fields", input: "我想预约" },
  { id: "unknown", input: "zzyxwvvv" },
];
export function evaluatePromptTemplate(ctx: Context, input: unknown) {
  authorize(ctx, ["admin", "reviewer"]);
  const { id } = z.object({ id: z.string().uuid() }).parse(input);
  const prompt = get<PromptTemplate>(ctx, id, "prompt");
  const at = performance.now();
  const cases = fixtures.map((c) => {
    const intent = extractServiceIntent(c.input),
      draft = draftResponse(intent, searchKnowledge(ctx, c.input)),
      output = renderTemplate(prompt.data.template, draft, intent.language);
    const quality = runResponseQualityCheck(output);
    return {
      ...c,
      output,
      risks: quality.risks.map((r) => r.type),
      passed: output.includes(draft) && quality.risks.length === 0,
    };
  });
  const result = create<TemplateEvaluation>(ctx, "promptEvaluation", {
    promptId: id,
    promptVersion: prompt.data.version,
    datasetVersion: "template-safety-v1",
    mode: "template-rules",
    modelCalled: false,
    total: cases.length,
    passed: cases.filter((c) => c.passed).length,
    durationMs: performance.now() - at,
    cases,
  });
  audit(ctx, "prompt.evaluated", result.id, {
    promptId: id,
    passed: result.data.passed,
    total: result.data.total,
  });
  return result;
}
export function promptLabState(ctx: Context): {
  prompts: RecordRow<PromptTemplate>[];
  evaluations: RecordRow<TemplateEvaluation>[];
} {
  return {
    prompts: list<PromptTemplate>(ctx, "prompt"),
    evaluations: ["admin", "reviewer"].includes(ctx.role)
      ? list<TemplateEvaluation>(ctx, "promptEvaluation")
      : [],
  };
}
