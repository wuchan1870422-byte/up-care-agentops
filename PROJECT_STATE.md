# UP-Care AgentOps — 项目状态

更新时间：2026-10-11（Asia/Shanghai）

## 本轮技术审计与面试升级

- 在既有项目继续；未购买服务、使用付费模型或重新初始化工程。
- 修复文档正文编辑重置限阅/停用属性、低权限咨询幂等重放/会话续写、重复及过期审批覆盖工单状态三个问题。
- 新增 5 项缺陷回归，原实现全部失败；修复后 95 项 Vitest 全部通过。
- 新增首页面试演示入口、虚构数据、补问/权限错误/审批/完成/刷新步骤；44 项本地双模式 E2E 全部通过。
- TypeScript、ESLint、生产 Build、77 条规则评测通过。生产依赖漏洞 0；开发依赖链 5 项高危记录保留，未强制降级。
- 文档：docs/INTERVIEW_GUIDE.md、docs/TECHNICAL_AUDIT.md。公开版没有 LLM/向量 RAG/模型 Tool Calling，不能宣称医疗生产系统。
- 应用提交 b1da4e7badde22c8002d84df7ac206949fe9e38a 已推送；CI 38126855561 成功，部署 dpl_EgdDyuufCvrNweuVyzPQo5SoB3jv Ready。
- 公网 22/22 E2E 通过（84.8 秒、无跳过/自动重试）；匿名首页和健康接口 200，modelCalled=false。首次两个网络初始化超时及远程等待配置调整已记录。
- 以下旧交付记录属于历史基线；本轮证据见 DELIVERY.md。后续收尾提交仅修改测试等待预算和文档，不改应用代码。

## 当前阶段
公开规则演示交付完成，新增批量报告、模拟集成与 Prompt 模板实验已上线并通过最终回归。完整原始需求保存在 docs/MASTER_SPEC.md，没有重新创建工程；不把规则演示等同于完整医疗生产系统。

## 已验证
- Next.js 16.4.0 生产构建、TypeScript、ESLint 通过。
- 90 项 Vitest 业务/恢复/报告/模板测试通过。
- 40 项 Playwright E2E 通过（20 场景 × SQLite 服务端 / IndexedDB 浏览器模式，51.4 秒）。
- 77 条独立 Agent 评测通过；非 LLM 或临床基准。
- 桌面/390px 手机页面检查无脚本错误或整页横向溢出。
- 数据库迁移与独立空间 Seed 实际运行成功。
- 公网 20 项 Playwright 测试通过（77.36 秒），无跳过或失败。
- GitHub Actions 37914795358 成功（应用提交 3efed9f），Linux Chromium 双存储模式验证通过。

## 关键实现
三栏工作台、真实 SSE、双语规则与语言偏好、多轮补问、真实关键词检索与版本、质检、联系人/线索/意向/工单/任务/审批、随访摘录、SOAP 边界、会话列表、运营分析、审计及 CSV。失败重试沿用原始 Run 幂等键。

公开版使用 SQLite WASM + IndexedDB 独立浏览器存储。本地版使用 Node SQLite 文件数据库，保留服务端校验。不是共享 PostgreSQL 生产后端。

## 发布状态
- GitHub 仓库已创建：https://github.com/wuchan1870422-byte/up-care-agentops
- GitHub 已推送；应用提交 3efed9f8826b7141e5069e19b4361609c1c4c79f，CI 运行 37914795358 已成功。
- Vercel CLI 已登录 wuchan1870422-byte，已创建并明确链接 up-care-agentops。
- 项目 ID prj_l8rZTLOcMdc7QfwWP5IQjj5anpfz。
- 已公开部署：https://up-care-agentops.vercel.app；匿名访问与健康接口 200，最新版 20 项公网 E2E 通过。
- 应用部署 dpl_DNtYc2Jmo4gq63vDe5Gz2yok2ngN Ready；已连接 GitHub 自动部署。
- 本地 Vercel 配置使用忽略目录 .vercel-cli，默认目录存在 EXDEV 问题。

## 外部能力
OpenAI Key 的本地保存未批准，未创建或写入 Key。真实 LLM、Embedding、Coze 与托管 PostgreSQL 未连接。状态矩阵公开记录这些差距，不冒充已完成。

## 接续任务
新增功能已编码：TXT/JSON 批量质检、报告导出及限阅过滤、Mock Appointment/CRM 操作、不可变 Prompt 模板版本、六案例模板规则检查与版本对比。模板实验不会自动更改咨询流程，不伪称 LLM 评测。

当前版本全部授权的发布步骤已完成。后续按 docs/FEATURE_STATUS.md 保留原完整需求：先落实真实模型凭据的安全存储，再实现并验证 Provider/Embedding；生产多用户需另行实现 PostgreSQL 与正式认证。Coze、真实排班与 CRM 不能仅凭 Mock 成功宣称接通。语音、任意工作流编辑及完整语义分析仍待开发。交付证据见 docs/DELIVERY.md。

