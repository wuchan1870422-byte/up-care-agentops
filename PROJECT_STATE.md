# UP-Care AgentOps — 项目状态

更新时间：2026-10-09（Asia/Shanghai）

## 当前阶段
公开规则演示已上线；正在完成新增批量报告、模拟集成与 Prompt 模板实验的最终回归。完整原始需求保存在 docs/MASTER_SPEC.md，没有重新创建工程。

## 已验证
- Next.js 16.4.0 生产构建、TypeScript、ESLint 通过。
- 90 项 Vitest 业务/恢复/报告/模板测试通过。
- 40 项 Playwright E2E 通过（20 场景 × SQLite 服务端 / IndexedDB 浏览器模式，51.4 秒）。
- 77 条独立 Agent 评测通过；非 LLM 或临床基准。
- 桌面/390px 手机页面检查无脚本错误或整页横向溢出。
- 数据库迁移与独立空间 Seed 实际运行成功。

## 关键实现
三栏工作台、真实 SSE、双语规则与语言偏好、多轮补问、真实关键词检索与版本、质检、联系人/线索/意向/工单/任务/审批、随访摘录、SOAP 边界、会话列表、运营分析、审计及 CSV。失败重试沿用原始 Run 幂等键。

公开版使用 SQLite WASM + IndexedDB 独立浏览器存储。本地版使用 Node SQLite 文件数据库，保留服务端校验。不是共享 PostgreSQL 生产后端。

## 发布状态
- GitHub 仓库已创建：https://github.com/wuchan1870422-byte/up-care-agentops
- GitHub 已推送；265cfce 对应 GitHub Actions 运行 37910477586 已成功。
- Vercel CLI 已登录 wuchan1870422-byte，已创建并明确链接 up-care-agentops。
- 项目 ID prj_l8rZTLOcMdc7QfwWP5IQjj5anpfz。
- 已公开部署：https://up-care-agentops.vercel.app；匿名访问与健康接口 200，首版 14 项公网 E2E 通过。
- 本地 Vercel 配置使用忽略目录 .vercel-cli，默认目录存在 EXDEV 问题。

## 外部能力
OpenAI Key 的本地保存未批准，未创建或写入 Key。真实 LLM、Embedding、Coze 与托管 PostgreSQL 未连接。状态矩阵公开记录这些差距，不冒充已完成。

## 接续任务
新增功能已编码：TXT/JSON 批量质检、报告导出及限阅过滤、Mock Appointment/CRM 操作、不可变 Prompt 模板版本、六案例模板规则检查与版本对比。模板实验不会自动更改咨询流程，不伪称 LLM 评测。

当前验证：修复服务端 connections 与 integrations 字段冲突、工单弹窗焦点恢复；90 项工程测试、40 项浏览器回归及构建通过。正在推送、重新部署并运行公网回归。参见 TASKS.md。

