# 公开演示交付记录

日期：2026-10-09。基于原项目继续开发，完整需求保存在 MASTER_SPEC.md。

- Live Demo：https://up-care-agentops.vercel.app
- 源码：https://github.com/wuchan1870422-byte/up-care-agentops
- CI：https://github.com/wuchan1870422-byte/up-care-agentops/actions

## 本次范围

已完成咨询 CSS 与页面构建恢复，咨询—检索—质检—预约意向—工单—人工审批—运营分析的持久化演示闭环。新增批量文件导入、质检报告、模拟 CRM 和预约接口、Prompt 模板版本及规则回归比较、筛选 CSV、失败幂等恢复和键盘操作修复。

当前代码通过 90 项 Vitest、77 条独立业务评测、40 项本地双模式 E2E、TypeScript、ESLint 和 Next 生产构建。首版公网 14 项 E2E 已通过；本次更新的最终生产部署及 20 项公网回归正在执行，结果会写回本文。

## 明确边界

交付是可公开操作的规则驱动概念应用，不是已经完成全部 Master Spec 的医疗生产系统。公开数据保存在浏览器 IndexedDB，本地可使用 SQLite；没有共享 PostgreSQL 或生产用户认证。

真实 LLM Provider、Embedding、在线 Coze、真实 CRM/排班、语音、任意图形工作流及完整语义随访尚未完成或接通。Prompt Lab 检查实际模板输出与已知风险规则，未调用模型，也不会自动应用模板到主咨询流程。此前 OpenAI Key 本地保存被拒绝，未创建 Key；不将 Codex 额度恢复当成 API 已配置。

业务资料只引用公开官网并区分推断。所有患者数据为虚构，无短信、邮件或正式医疗文书写入。逐项范围与后续任务见 FEATURE_STATUS.md、PROJECT_STATE.md、TASKS.md。
