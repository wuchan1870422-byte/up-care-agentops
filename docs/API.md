# 本地 API

基础地址 `http://127.0.0.1:3000/api`。JSON 响应不缓存。先 GET `/session` 获得 HttpOnly、SameSite=Strict 的演示 cookie。POST 要求与实际请求 Host/协议相匹配的 Origin。角色从服务端会话读取，不信任 body 中伪造的 role。

Vercel 公开版本使用浏览器独立数据，业务 API 返回明确的 503，`/health` 可正常查询；不把公开版称为共享服务器数据库。

| 方法 / 路径 | 输入 / 用途 | 写入角色 |
|---|---|---|
| GET session | 初始化或读取独立会话 | 所有人 |
| GET state | 当前空间可访问业务数据及统计 | 当前会话 |
| GET health | mode、storage、modelCalled | 无需会话 |
| GET search?q= | 文档片段、排序得分、版本、来源 | 当前会话 |
| GET analytics?clinic=&from=&to= | 院区与 ISO 日期范围 | 当前会话 |
| GET export?clinic=&status= | 工单 CSV，防公式注入 | manager/admin |
| POST role | `{role}`；只用于演示 | 当前会话 |
| POST consult | `{text, key, conversationId?, retryOf?}` | service/operator/admin |
| POST approve | `{id, decision, note}` | reviewer/manager/admin；医疗判断只 reviewer/admin |
| POST ticket | `{title, key, clinic?, priority?, conversationId?, runId?}` | service/operator/reviewer/admin |
| POST ticket/status | `{id,status: in_progress或completed,note?}` | operator/manager/admin |
| POST ticket/assign | `{id,assignedTo,note?}` | operator/manager/admin |
| POST quality | `{texts: string[1..20]}` | service/operator/reviewer/admin |
| POST quality/review | `{id,note}` | reviewer/admin |
| POST document | `{id?,title,content,source,visibility?,active?}` | reviewer/admin |
| POST document/archive | `{id}`；软删除/归档并保留版本 | reviewer/admin |
| POST upload | multipart `file`，TXT/MD/文本 PDF，2MB | reviewer/admin |
| POST followup | `{text,key}`，每行一条模拟记录 | operator/reviewer/admin |
| POST followup/status | `{id,status}` | operator/reviewer/admin |
| POST soap | `{text}` | reviewer/admin |
| POST evaluate | `{}` | manager/admin |
| POST coze | `{text}`；需服务端凭据 | admin |
| POST reset | `{confirm: NEW_WORKSPACE}`，不删除旧空间 | 当前会话 |

`consult` 使用 `Accept: text/event-stream` 时返回 `progress`、`result`、`error` SSE 事件；progress 的数据为已写入 Repository 的 Run 快照。没有定时模拟进度。

错误返回 `{error}`，使用 400 校验失败、401 无会话、403 无权限/来源错误、404 对象不存在、409 状态或幂等冲突、413 大小限制、429 空间容量限制、503 未配置能力。普通 JSON 请求总大小限制 200KB；咨询最多 8000 字符，知识正文最多 100000 字符。

幂等 key 对应完整请求 fingerprint。相同 key 同样输入返回原结果，不同输入返回冲突；失败重试必须引用失败 Run，保留同一会话与原输入。
