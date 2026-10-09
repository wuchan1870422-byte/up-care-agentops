# 部署与维护

## 本地模式

Node 24.x。`npm ci` → `npm run db:init` → `npm run build` → `npm start`。数据库默认 `data/agentops.sqlite`，只用于本地持久服务；完整备份须包括 SQLite WAL 状态，建议停服后备份目录。

## Vercel 公开演示

已验证公开地址：https://up-care-agentops.vercel.app 。GitHub：https://github.com/wuchan1870422-byte/up-care-agentops 。首版匿名访问及健康检查均返回 200，公开业务流程已实际运行测试。

目标项目固定为 `wuchan1870422-byte/up-care-agentops`。配置见根目录 vercel.json。Vercel 环境使用浏览器独立存储，不启动本地 SQLite，不向用户承诺共享云数据库。

```bash
vercel link --project up-care-agentops --scope wuchan1870422-byte
vercel project inspect --non-interactive
vercel deploy --prod
```

执行前确认 inspect 的名称、owner 与本项目一致。不要操作账号中的其他项目。部署后以全新浏览器验证 `/`、`/demo`、`/api/health` 和六个主场景，确保没有登录保护阻止公众访问。

构建时 `prebuild` 从 npm 包复制 `sql-wasm.wasm` 到 public，发布依赖中有 sql.js；无需上传本机 WASM 生成物。不得把 data、.env.local、.vercel-cli 或认证文件发布。

本机 Vercel CLI 的默认配置目录曾触发 EXDEV，因此本次使用已忽略的项目内 `.vercel-cli`：命令追加 `--global-config .vercel-cli`。不要提交该目录。CLI 安装于 npm 缓存，不要求改变系统 PATH。

## 回滚与数据说明

GitHub Actions 在 master push / pull request 时执行 Node 24 的类型、Lint、业务测试、规则评测、生产构建与两种存储模式的 Chromium E2E。工作流采用固定 action commit，仅读取仓库，不需要模型或部署 Secret。Vercel 已连接同名 GitHub 仓库，支持提交触发部署；CLI 也可执行明确目标的生产发布。

代码回滚使用已验证的 Vercel 部署版本；不要删除用户本机 IndexedDB。新建演示空间只是切换当前浏览器上下文，旧记录仍保留。浏览器存储格式目前为 v1，未来数据迁移必须先保留旧快照。

## 后续生产部署

先补齐 PostgreSQL 驱动、正式身份认证与数据隔离，再开放服务端业务 API。凭据只放服务端环境变量。真实 AI、Coze、Embedding 需要单独配置、授权与费用控制；公开演示保持默认规则模式，不能让访客无限调用收费 API。
