# UP-Care AgentOps — 项目状态

更新时间：2026-10-09（Asia/Shanghai）

## 当前阶段
规则演示核心功能已实现并通过本地与浏览器双模式回归；进入公网发布及交付完善。完整原始需求保存在 docs/MASTER_SPEC.md，没有重新创建工程。

## 已验证
- Next.js 16.4.0 生产构建、TypeScript、ESLint 通过。
- 69 项 Vitest 业务/恢复测试通过。
- 28 项 Playwright E2E 通过（14 场景 × SQLite 服务端 / IndexedDB 浏览器模式，34.2 秒）。
- 77 条独立 Agent 评测通过；非 LLM 或临床基准。
- 桌面/390px 手机页面检查无脚本错误或整页横向溢出。
- 数据库迁移与独立空间 Seed 实际运行成功。

## 关键实现
三栏工作台、真实 SSE、双语规则与语言偏好、多轮补问、真实关键词检索与版本、质检、联系人/线索/意向/工单/任务/审批、随访摘录、SOAP 边界、会话列表、运营分析、审计及 CSV。失败重试沿用原始 Run 幂等键。

公开版使用 SQLite WASM + IndexedDB 独立浏览器存储。本地版使用 Node SQLite 文件数据库，保留服务端校验。不是共享 PostgreSQL 生产后端。

## 发布状态
- GitHub 仓库已创建：https://github.com/wuchan1870422-byte/up-care-agentops
- GitHub CLI 已授权 repo，准备推送。
- Vercel CLI 已登录 wuchan1870422-byte，已创建并明确链接 up-care-agentops。
- 项目 ID prj_l8rZTLOcMdc7QfwWP5IQjj5anpfz，尚待完成首次部署验证。
- 本地 Vercel 配置使用忽略目录 .vercel-cli，默认目录存在 EXDEV 问题。

## 外部能力
OpenAI Key 的本地保存未批准，未创建或写入 Key。真实 LLM、Embedding、Coze 与托管 PostgreSQL 未连接。状态矩阵公开记录这些差距，不冒充已完成。

## 接续任务
推送源码 → 部署并验证公网六场景 → 补齐 CI、管理报告和剩余可独立功能 → 更新文档与最终链接。参见 TASKS.md。

