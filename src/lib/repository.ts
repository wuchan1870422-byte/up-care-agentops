import type { Context, Kind, RecordRow } from "./types";
export type SqlValue = string | number | null;
export interface DatabaseDriver {
  exec(sql: string): unknown;
  prepare(sql: string): {
    run(...values: SqlValue[]): unknown;
    get(...values: SqlValue[]): unknown;
    all(...values: SqlValue[]): unknown[];
  };
}
let factory: (() => DatabaseDriver) | undefined;
export function setDatabaseFactory(value: () => DatabaseDriver) {
  factory = value;
}
export function db(): DatabaseDriver {
  if (!factory) throw new AppError("数据存储尚未初始化", 503);
  return factory();
}
export function transaction<T>(fn: () => T): T {
  const d = db();
  d.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    d.exec("COMMIT");
    return result;
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
}
function decode<T>(r: unknown): RecordRow<T> {
  const v = r as {
    id: string;
    workspace: string;
    kind: Kind;
    data: string;
    created_at: string;
    updated_at: string;
  };
  return {
    id: v.id,
    workspace: v.workspace,
    kind: v.kind,
    data: JSON.parse(v.data) as T,
    createdAt: v.created_at,
    updatedAt: v.updated_at,
  };
}
export function list<T = Record<string, unknown>>(
  ctx: Context,
  kind: Kind,
): RecordRow<T>[] {
  return db()
    .prepare(
      "SELECT * FROM records WHERE workspace=? AND kind=? ORDER BY created_at DESC,rowid DESC",
    )
    .all(ctx.workspace, kind)
    .map((r) => decode<T>(r));
}
export function get<T>(ctx: Context, id: string, kind?: Kind): RecordRow<T> {
  const row = db()
    .prepare("SELECT * FROM records WHERE workspace=? AND id=?")
    .get(ctx.workspace, id);
  if (!row) throw new AppError("记录不存在", 404);
  const parsed = decode<T>(row);
  if (kind && parsed.kind !== kind) throw new AppError("记录类型不匹配", 400);
  return parsed;
}
export function create<T>(ctx: Context, kind: Kind, data: T): RecordRow<T> {
  const id = crypto.randomUUID(),
    now = new Date().toISOString();
  db()
    .prepare("INSERT INTO records VALUES(?,?,?,?,?,?)")
    .run(id, ctx.workspace, kind, JSON.stringify(data), now, now);
  return {
    id,
    workspace: ctx.workspace,
    kind,
    data,
    createdAt: now,
    updatedAt: now,
  };
}
export function update<T>(ctx: Context, id: string, data: T) {
  get(ctx, id);
  db()
    .prepare(
      "UPDATE records SET data=?,updated_at=? WHERE id=? AND workspace=?",
    )
    .run(JSON.stringify(data), new Date().toISOString(), id, ctx.workspace);
  return get<T>(ctx, id);
}
export function audit(
  ctx: Context,
  action: string,
  target: string,
  detail: unknown = {},
) {
  db()
    .prepare("INSERT INTO audit VALUES(?,?,?,?,?,?,?)")
    .run(
      crypto.randomUUID(),
      ctx.workspace,
      ctx.role,
      action,
      target,
      JSON.stringify(detail),
      new Date().toISOString(),
    );
}
export function auditList(ctx: Context) {
  return db()
    .prepare(
      "SELECT id,role,action,target,detail,created_at FROM audit WHERE workspace=? ORDER BY rowid DESC LIMIT 300",
    )
    .all(ctx.workspace);
}
export function idempotent<T>(
  ctx: Context,
  key: string,
  fingerprint: string,
  fn: () => T,
): T {
  return transaction(() => {
    const row = db()
      .prepare("SELECT * FROM idempotency WHERE workspace=? AND key=?")
      .get(ctx.workspace, key) as
      { fingerprint: string; result: string } | undefined;
    if (row) {
      if (row.fingerprint !== fingerprint)
        throw new AppError("幂等键已用于不同请求", 409);
      return JSON.parse(row.result) as T;
    }
    const result = fn();
    db()
      .prepare("INSERT INTO idempotency VALUES(?,?,?,?)")
      .run(ctx.workspace, key, fingerprint, JSON.stringify(result));
    return result;
  });
}
export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function authorize(ctx: Context, allowed: Context["role"][]) {
  if (!allowed.includes(ctx.role))
    throw new AppError("当前角色无权执行此操作", 403);
}
