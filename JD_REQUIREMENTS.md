# JD-to-Feature Traceability

| 招聘能力 | 可检查的实现与证据 | 诚实边界 |
|---|---|---|
| Vibe Coding 快速交付 | 保留旧工程继续开发；Git 分阶段提交；Next 构建、共享组件和业务 API | 不以页面数量代替实际业务闭环 |
| 主动发现场景 | docs/BUSINESS_RESEARCH.md 的公开事实、推断与未验证项 | 不编造企业经营数据 |
| Agent / 工具调用 | src/lib/workflow.ts、tools.ts；可回看输入、输出、耗时、失败与人工节点 | 目前由规则执行计划，非真实 LLM 调用 |
| RAG | 文档上传、分块、关键词排序、版本引用与访问限制 | 未接入 Embedding，不能宣称完整向量 RAG |
| Coze 工作流 | src/lib/coze.ts 与 docs/COZE_WORKFLOW.md | 适配器存在；没有 Coze 凭据，未验证在线连接 |
| Python / JavaScript 调试基础 | TypeScript 分层业务逻辑，Zod 输入校验，Vitest 和 Playwright | 以测试结果为准，不虚构通过率 |
| 业务自动化 | 工单、预约意向、人工审批、随访待办与统计真实更新 | 只操作自建虚构数据，不发患者消息 |
| 持续迭代 | 质检回归、失败注入、幂等恢复、评测版本、进度日志 | 规则评测不代表临床或真实模型性能 |
| 知识沉淀与沟通 | README、API、架构、演示手册、部署指南、状态矩阵 | 未完成项公开记录 |
| 独立上线作品 | GitHub 仓库与 Vercel Live Demo，交付后链接写入 README | 以实际验证的链接为准 |

招聘截图是用户提供的岗位资料，项目不是招聘企业的官方系统。
