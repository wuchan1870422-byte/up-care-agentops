import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { interviewScenario } from "../../src/lib/interview-scenario";
const nav = (page: Page, name: string) =>
  page
    .locator("nav")
    .getByRole("button", { name: new RegExp(name.replace("LIVE", "")) })
    .click();
async function role(page: Page, value: string) {
  await page.getByLabel("切换演示角色").selectOption(value);
  await expect(page.getByRole("status")).toContainText("角色已切换");
}
async function run(page: Page) {
  await nav(page, "Agent 工作台LIVE");
  await page.getByRole("button", { name: "运行 Agent", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("执行记录已保存");
}
test.beforeEach(async ({ page }, info) => {
  await page.goto(info.project.name === "browser-indexeddb" ? "/demo" : "/");
  await expect(
    page.getByRole("heading", { name: "每一次服务，都有迹可循。" }),
  ).toBeVisible({ timeout: process.env.E2E_BASE_URL ? 30000 : 10000 });
});
test("overview explains independent rule-based demo and real zero metrics", async ({
  page,
}) => {
  await expect(page.locator(".concept-banner")).toContainText("非官方概念演示");
  await expect(page.getByText("规则演示模式", { exact: true })).toBeVisible();
  await expect(page.locator(".metric").first()).toContainText("00");
});

test("interview flow collects missing fields, rejects unauthorized export and completes an approved ticket", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.getByRole("button", { name: "开始面试演示", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("面试演示空间已准备");
  await expect(page.getByLabel("患者咨询内容")).toHaveValue(
    interviewScenario.initial,
  );
  await page.getByRole("button", { name: "运行 Agent", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("执行记录已保存");
  await expect(page.locator(".outcome")).toContainText("clinic");
  await expect(page.locator(".ticket-link")).toHaveCount(0);
  await page.getByRole("button", { name: "填入补充信息", exact: true }).click();
  await page.getByRole("button", { name: "运行 Agent", exact: true }).click();
  await expect(page.locator(".ticket-link")).toBeVisible();
  await expect(page.locator(".execution-node")).toHaveCount(10);
  await nav(page, "服务工单");
  await page.getByRole("button", { name: "导出 CSV", exact: true }).click();
  await expect(page.locator(".alert.error")).toContainText("无权");
  await expect(page.locator("[data-ticket-id]")).toHaveCount(1);
  await role(page, "reviewer");
  await page.locator("[data-ticket-id]").click();
  await page.getByRole("button", { name: "通过审核", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("审核通过");
  await page.getByLabel("关闭工单").click();
  await role(page, "operator");
  await page.locator("[data-ticket-id]").click();
  await page.getByRole("button", { name: "开始处理", exact: true }).click();
  await expect(page.locator("[role=dialog] .badge").first()).toHaveText(
    "处理中",
  );
  await page.getByRole("button", { name: "完成工单", exact: true }).click();
  await expect(page.locator("[role=dialog] .badge").first()).toHaveText(
    "已完成",
  );
  await page.getByLabel("关闭工单").click();
  await nav(page, "运营总览");
  await expect(page.locator(".metric").nth(1)).toContainText("1 已完成");
  await page.reload();
  await expect(page.locator(".metric").nth(1)).toContainText("1 已完成");
  expect(errors).toEqual([]);
});

test("knowledge edits preserve restriction and disabled state; role changes clear cached evidence", async ({
  page,
}) => {
  await role(page, "admin");
  await nav(page, "知识中心");
  await page.getByLabel("文档标题", { exact: true }).fill("星河限阅测试");
  await page
    .getByLabel("正文", { exact: true })
    .fill("星河限阅测试，虚构访问标记 ONLY_REVIEWER_42。");
  await page.getByLabel("文档可见性").selectOption("reviewer");
  await page.getByRole("button", { name: "保存并索引" }).click();
  await expect(page.getByRole("status")).toContainText("新版本");
  await page.getByLabel("检索问题").fill("星河限阅测试");
  await page.getByRole("button", { name: "检索知识", exact: true }).click();
  await expect(page.locator(".citation-list")).toContainText(
    "ONLY_REVIEWER_42",
  );
  const doc = page.locator(".document").filter({ hasText: "星河限阅测试" });
  await doc.getByRole("button", { name: "编辑文档", exact: true }).click();
  await page.getByLabel("允许参与检索").uncheck();
  await page
    .getByLabel("正文", { exact: true })
    .fill("星河限阅测试更新，虚构访问标记 ONLY_REVIEWER_43。");
  await page.getByRole("button", { name: "保存并索引" }).click();
  await doc.getByRole("button", { name: "编辑文档", exact: true }).click();
  await expect(page.getByLabel("文档可见性")).toHaveValue("reviewer");
  await expect(page.getByLabel("允许参与检索")).not.toBeChecked();
  await role(page, "service");
  await expect(page.getByLabel("正文", { exact: true })).toHaveValue("");
  await expect(page.locator(".citation-list")).toHaveCount(0);
  await expect(doc).toHaveCount(0);
});
test("consultation creates ticket, evidence and actual execution nodes", async ({
  page,
}) => {
  await run(page);
  await expect(page.locator(".execution-node")).toHaveCount(10);
  await expect(page.locator(".outcome")).toContainText("前滩");
  await expect(page.locator(".outcome")).toContainText("周六上午");
  await expect(page.locator(".ticket-link")).toBeVisible();
  await expect(page.locator(".citation-list").first()).toContainText("v1");
});
test("approval and status changes update persistent metrics", async ({
  page,
}) => {
  await run(page);
  await role(page, "reviewer");
  await page.getByRole("button", { name: "通过审核", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("审核通过");
  await role(page, "operator");
  await page.locator(".ticket-link").click();
  await page.getByRole("button", { name: "开始处理", exact: true }).click();
  await expect(page.locator("[role=dialog] .badge").first()).toHaveText(
    "处理中",
  );
  await page.getByRole("button", { name: "完成工单", exact: true }).click();
  await expect(page.locator("[role=dialog] .badge").first()).toHaveText(
    "已完成",
  );
  await page.reload();
  await nav(page, "运营总览");
  await expect(page.locator(".metric").nth(1)).toContainText("1 已完成");
});
test("new conversation clears previous workspace", async ({ page }) => {
  await run(page);
  await page.getByRole("button", { name: "新会话", exact: true }).click();
  await expect(
    page.getByText("让服务从理解开始", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".ticket-link")).toHaveCount(0);
});
test("missing fields collected over two turns", async ({ page }) => {
  await nav(page, "Agent 工作台LIVE");
  await page.getByLabel("患者咨询内容").fill("我想预约");
  await page.getByRole("button", { name: "运行 Agent", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("执行记录已保存");
  await expect(page.locator(".ticket-link")).toHaveCount(0);
  await page.getByLabel("患者咨询内容").fill("前滩周六上午");
  await page.getByRole("button", { name: "运行 Agent", exact: true }).click();
  await expect(page.locator(".ticket-link")).toBeVisible();
});
test("quality identifies all master scenario B promises", async ({ page }) => {
  await nav(page, "服务质检");
  await page
    .getByLabel("模拟客服回复")
    .fill("你的膝盖问题不严重，来做两次康复就能好，保险也肯定能报销。");
  await page.getByRole("button", { name: "运行质检", exact: true }).click();
  await expect(page.locator(".quality-item")).toContainText("3 个问题");
  await page.locator(".quality-item summary").click();
  await expect(page.locator(".risk")).toHaveCount(3);
});
test("batch quality persists exactly twenty records", async ({ page }) => {
  await nav(page, "服务质检");
  await page.getByRole("button", { name: "批量演示 · 20 条" }).click();
  await expect(page.locator(".quality-item")).toHaveCount(20);
  await page.reload();
  await nav(page, "服务质检");
  await expect(page.locator(".quality-item")).toHaveCount(20);
});
test("knowledge indexing and version edits affect search", async ({ page }) => {
  await role(page, "admin");
  await nav(page, "知识中心");
  await page.getByLabel("文档标题", { exact: true }).fill("星河服务规则");
  await page
    .getByLabel("正文", { exact: true })
    .fill("星河专属通道只处理模拟服务咨询，需要人工确认。");
  await page.getByRole("button", { name: "保存并索引" }).click();
  await expect(page.getByRole("status")).toContainText("新版本");
  await page.getByLabel("检索问题").fill("星河");
  await page.getByRole("button", { name: "检索知识", exact: true }).click();
  await expect(page.locator(".citation-list")).toContainText("星河专属通道");
  await page
    .locator(".document")
    .filter({ hasText: "星河服务规则" })
    .getByRole("button", { name: "编辑文档" })
    .click();
  await page
    .getByLabel("正文", { exact: true })
    .fill("星河专属通道已更新为周四处理模拟服务咨询。");
  await page.getByRole("button", { name: "保存并索引" }).click();
  await expect(
    page.locator(".document").filter({ hasText: "星河服务规则" }),
  ).toContainText("v2");
});
test("role controls reject unauthorized writes visibly", async ({ page }) => {
  await nav(page, "知识中心");
  await page.getByLabel("文档标题", { exact: true }).fill("未授权文档");
  await page
    .getByLabel("正文", { exact: true })
    .fill("本条测试验证客服不能新增知识库文档。");
  await page.getByRole("button", { name: "保存并索引" }).click();
  await expect(page.locator(".alert.error")).toContainText("无权");
});
test("follow-up creates persisted human task", async ({ page }) => {
  await role(page, "operator");
  await nav(page, "随访辅助");
  await page.getByRole("button", { name: "生成跟进任务" }).click();
  await expect(page.locator(".followup-item")).toHaveCount(1);
  await page.reload();
  await nav(page, "随访辅助");
  await expect(page.locator(".followup-item")).toContainText("尚未核实");
});
test("SOAP preserves unknown objective assessment and plan", async ({
  page,
}) => {
  await role(page, "reviewer");
  await nav(page, "文书辅助");
  await page.getByRole("button", { name: "整理文书草稿" }).click();
  await expect(page.locator(".note-item")).toContainText("未提供客观检查");
  await expect(page.locator(".note-item")).toContainText("待医疗专业人员评估");
  await expect(page.locator(".note-item")).toContainText("待医疗专业人员制定");
});
test("evaluations run actual cases and persist results", async ({ page }) => {
  await role(page, "manager");
  await nav(page, "Evaluation Lab");
  await page.getByRole("button", { name: "运行评测", exact: true }).click();
  await expect(page.locator(".eval-details")).toHaveCount(1);
  await page.locator(".eval-details summary").click();
  await expect(page.locator(".eval-details tbody tr")).toHaveCount(77);
});
test("mobile view has no horizontal page overflow and supports theme", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("heading", { name: "每一次服务，都有迹可循。" }),
  ).toBeVisible();
  await page.getByLabel("切换主题").click();
  await expect(page.locator(".app")).toHaveClass(/dark/);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("new demo workspace resets current browser without deleting old data", async ({
  page,
}) => {
  await run(page);
  await nav(page, "系统设置");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "新建演示空间" }).click();
  await expect(page.getByRole("status")).toContainText("已切换");
  await nav(page, "运营总览");
  await expect(page.locator(".metric").first()).toContainText("00");
});

test("quality file import saves records and downloads an authorized report", async ({
  page,
}) => {
  await role(page, "reviewer");
  await nav(page, "服务质检");
  await page.getByLabel("导入质检文件").setInputFiles({
    name: "fictional.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify(["保险肯定能报销", "需要人工核实服务信息"]),
    ),
  });
  await expect(page.locator(".quality-item")).toHaveCount(2);
  await expect(page.getByLabel("批量质检进度")).toHaveAttribute("value", "2");
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出本批次报告" }).click();
  const download = await downloadEvent;
  const path = await download.path();
  expect(path).toBeTruthy();
  const content = await readFile(path!, "utf8");
  expect(content).toContain("检查记录：2");
  expect(content).toContain("保险肯定能报销");
  await page.reload();
  await nav(page, "服务质检");
  await expect(page.locator(".quality-item")).toHaveCount(2);
});
test("mock integrations use saved intentions and persist idempotent CRM sync", async ({
  page,
}) => {
  await run(page);
  await role(page, "operator");
  await nav(page, "系统设置");
  await page.getByRole("button", { name: "查询模拟预约接口" }).click();
  await expect(
    page.getByText("模拟预约接口返回 1 条意向；排班状态：未核实。"),
  ).toBeVisible();
  await page.getByRole("button", { name: "模拟同步 CRM" }).click();
  await expect(page.getByRole("button", { name: "已模拟同步" })).toBeDisabled();
  await page.reload();
  await nav(page, "系统设置");
  await expect(page.getByRole("button", { name: "已模拟同步" })).toBeDisabled();
});
test("ticket dialog closes with Escape and restores trigger focus", async ({
  page,
}) => {
  await run(page);
  await page.locator(".ticket-link").click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("[data-ticket-id]").first()).toBeFocused();
});
test("English inquiry produces grounded service information", async ({
  page,
}) => {
  await nav(page, "Agent 工作台LIVE");
  await page
    .getByLabel("患者咨询内容")
    .fill("Could you tell me about rehabilitation services at Qiantan clinic?");
  await page.getByRole("button", { name: "运行 Agent", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("执行记录已保存");
  await expect(page.locator(".outcome")).toContainText("Qiantan");
  await expect(page.locator(".outcome")).toContainText("official website");
});

test("prompt versions expose real regressions and survive refresh", async ({
  page,
}) => {
  await role(page, "admin");
  await nav(page, "Prompt Lab");
  await page.getByRole("button", { name: "保存模板新版本" }).click();
  await page.getByRole("button", { name: "检查模板 v1", exact: true }).click();
  await expect(page.locator(".eval-details summary")).toContainText("6/6");
  await page
    .getByLabel("回复模板", { exact: true })
    .fill("{{draft}}\n保险肯定能报销。");
  await page
    .getByLabel("版本说明", { exact: true })
    .fill("故意引入承诺，验证风险回归");
  await page.getByRole("button", { name: "保存模板新版本" }).click();
  await page.getByRole("button", { name: "检查模板 v2", exact: true }).click();
  await expect(
    page.locator(".info-box").filter({ hasText: "最新 v2" }),
  ).toContainText("通过项变化 -6");
  await page.reload();
  await nav(page, "Prompt Lab");
  await expect(
    page.getByRole("button", { name: "检查模板 v2", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".eval-details")).toHaveCount(2);
});

test("analytics filters stored activity and exports matching tickets", async ({
  page,
}) => {
  await run(page);
  await role(page, "manager");
  await nav(page, "运营分析");
  await page.getByLabel("分析院区").selectOption("gubei");
  await page.getByRole("button", { name: "查询分析", exact: true }).click();
  await expect(page.locator(".metric").first().locator("strong")).toHaveText(
    "0",
  );
  await page.getByLabel("分析院区").selectOption("qiantan");
  await page.getByRole("button", { name: "查询分析", exact: true }).click();
  await expect(page.locator(".metric").first().locator("strong")).toHaveText(
    "1",
  );
  await page.getByLabel("导出工单状态").selectOption("pending");
  const event = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出筛选工单 CSV" }).click();
  const path = await (await event).path();
  expect(await readFile(path!, "utf8")).toContain("qiantan");
});
