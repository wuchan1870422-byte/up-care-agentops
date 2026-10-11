# 公开演示交付记录

## 2026-10-11 技术审计与面试升级

在原项目修复三个已复现问题：文档 metadata 重置、限阅咨询缓存重放/续写、过期审批覆盖目标状态。保留所有原有功能及旧数据，增加首页面试入口和独立虚构空间。

本轮本地已通过：95 项 Vitest、44 项双模式 E2E、77 条规则评测、TypeScript、ESLint、Next 生产构建。生产依赖漏洞 0；开发依赖 5 项高危链未强制降级。新增 INTERVIEW_GUIDE.md 与 TECHNICAL_AUDIT.md，准确说明没有 LLM、向量检索、模型自主 Tool Calling 或正式认证。

本轮发布与验证证据：

- [应用提交 b1da4e7](https://github.com/wuchan1870422-byte/up-care-agentops/commit/b1da4e7badde22c8002d84df7ac206949fe9e38a)，已推送 master。
- [GitHub Actions 38126855561](https://github.com/wuchan1870422-byte/up-care-agentops/actions/runs/38126855561) 成功：Ubuntu Chromium 工程检查及双模式 E2E。
- Vercel 生产部署 `dpl_EgdDyuufCvrNweuVyzPQo5SoB3jv` Ready；GitHub Vercel commit status 成功，别名为 [公开 Demo](https://up-care-agentops.vercel.app/)。
- 匿名首页 200；`/api/health` 200，`status=ok, storage=browser, modelCalled=false`；`/api/state` 按设计返回 503，避免误认为公共共享数据库已经配置。
- 公网完整 E2E **22/22 通过，84.8 秒**，无跳过或自动重试。首次出现两个网络初始化超时，资源响应均为 200；按轨迹调整远程测试就绪等待后复验，未修改业务断言。详情见 TEST_REPORT.md。
- 新面试入口桌面/390px 手机无 pageerror 或整页横向溢出；截图见 screenshots/interview-desktop.png 与 interview-mobile.png。

收尾提交只更新测试远程等待预算和验证文档，应用代码与上述已测版本一致。下方提交、CI 和部署编号属于历史记录。

## 历史交付

日期：2026-10-09。基于原项目继续开发，完整需求保存在 MASTER_SPEC.md。

- Live Demo：https://up-care-agentops.vercel.app
- 源码：https://github.com/wuchan1870422-byte/up-care-agentops
- CI：https://github.com/wuchan1870422-byte/up-care-agentops/actions

## 本次范围

已完成咨询 CSS 与页面构建恢复，咨询—检索—质检—预约意向—工单—人工审批—运营分析的持久化演示闭环。新增批量文件导入、质检报告、模拟 CRM 和预约接口、Prompt 模板版本及规则回归比较、筛选 CSV、失败幂等恢复和键盘操作修复。

当前代码通过 90 项 Vitest、77 条独立业务评测、40 项本地双模式 E2E（51.4 秒）、TypeScript、ESLint 和 Next 生产构建。最终生产版本通过 20 项匿名公网 E2E（77.36 秒，无失败/跳过）。

验证应用提交：`3efed9f8826b7141e5069e19b4361609c1c4c79f`。

- [成功的 GitHub Actions](https://github.com/wuchan1870422-byte/up-care-agentops/actions/runs/37914795358)：Ubuntu + Chromium，完整工程检查和 40 项 E2E。
- Vercel 部署：`dpl_DNtYc2Jmo4gq63vDe5Gz2yok2ngN`，状态 Ready，生产域名已指向该应用版本；后续纯文档提交可触发同一应用的重新部署。
- 匿名 `/api/health`：HTTP 200，`status=ok, mode=demo, storage=browser, modelCalled=false`。
- 桌面与 390px 手机检查：无 pageerror、无整页横向溢出；最终截图在 screenshots/。
- GitHub 与 Vercel 已连接，后续提交可自动部署；无需在 GitHub Actions 配置模型或部署密钥。

交付文档更新未改变上述已测应用代码。

## 明确边界

交付是可公开操作的规则驱动概念应用，不是已经完成全部 Master Spec 的医疗生产系统。公开数据保存在浏览器 IndexedDB，本地可使用 SQLite；没有共享 PostgreSQL 或生产用户认证。

真实 LLM Provider、Embedding、在线 Coze、真实 CRM/排班、语音、任意图形工作流及完整语义随访尚未完成或接通。Prompt Lab 检查实际模板输出与已知风险规则，未调用模型，也不会自动应用模板到主咨询流程。此前 OpenAI Key 本地保存被拒绝，未创建 Key；不将 Codex 额度恢复当成 API 已配置。

业务资料只引用公开官网并区分推断。所有患者数据为虚构，无短信、邮件或正式医疗文书写入。逐项范围与后续任务见 FEATURE_STATUS.md、PROJECT_STATE.md、TASKS.md。
