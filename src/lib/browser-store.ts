"use client";
import { analytics } from "./analytics";
import { qualityReport } from "./reports";
import { mockAppointments } from "./integrations";
import initSqlJs, { type Database, type SqlJsStatic } from "sql.js";
import {
  setDatabaseFactory,
  db,
  AppError,
  audit,
  type SqlValue,
} from "./repository";
import { databaseSchema } from "./database-schema";
import { seedKnowledge, searchKnowledge, saveDocument } from "./knowledge";
import { workspaceState, operation, exportTickets } from "./operations";
import {
  roles,
  type Context,
  type Role,
  type RecordRow,
  type Run,
} from "./types";
let sql: SqlJsStatic;
let connection: Database;
let indexed: IDBDatabase;
let context: Context;
let ready: Promise<void> | undefined;
let sequence: Promise<unknown> = Promise.resolve();
function request<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () =>
      reject(new AppError("浏览器存储不可用，请允许此站点保存数据", 503));
  });
}
async function load() {
  const saved = (await request(
    indexed
      .transaction("snapshots", "readonly")
      .objectStore("snapshots")
      .get("current"),
  )) as { bytes: Uint8Array; context: Context } | undefined;
  connection?.close();
  connection = new sql.Database(saved?.bytes);
  connection.run("PRAGMA foreign_keys=ON;");
  connection.run(databaseSchema);
  setDatabaseFactory(() => ({
    exec: (query) => connection.run(query),
    prepare: (query) => ({
      run: (...values: SqlValue[]) => connection.run(query, values),
      all: (...values: SqlValue[]) => {
        const s = connection.prepare(query);
        try {
          s.bind(values);
          const rows = [];
          while (s.step()) rows.push(s.getAsObject());
          return rows;
        } finally {
          s.free();
        }
      },
      get: (...values: SqlValue[]) => {
        const s = connection.prepare(query);
        try {
          s.bind(values);
          return s.step() ? s.getAsObject() : undefined;
        } finally {
          s.free();
        }
      },
    }),
  }));
  if (saved) context = saved.context;
  else newWorkspace();
}
function newWorkspace() {
  context = { workspace: crypto.randomUUID(), role: "service" };
  db()
    .prepare("INSERT INTO workspaces VALUES(?,?)")
    .run(context.workspace, new Date().toISOString());
  seedKnowledge({ ...context, role: "admin" });
}
function persist() {
  return new Promise<void>((resolve, reject) => {
    const tx = indexed.transaction("snapshots", "readwrite");
    tx.objectStore("snapshots").put(
      { bytes: connection.export(), context },
      "current",
    );
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () =>
      reject(new AppError("浏览器保存失败，本次操作未确认，请重试", 503));
  });
}
async function initialize() {
  sql = await initSqlJs({ locateFile: () => "/sql-wasm.wasm" });
  const open = indexedDB.open("upcare-agentops-demo-v1", 1);
  open.onupgradeneeded = () => open.result.createObjectStore("snapshots");
  indexed = await request(open);
}
export function browserRequest<T>(
  path: string,
  body?: unknown,
  onProgress?: (run: RecordRow<Run>) => void,
): Promise<T> {
  const run = async () => {
    await (ready ??= initialize());
    const work = async () => {
      await load();
      const [endpoint, query] = path.split("?");
      const input = body as Record<string, unknown> | undefined;
      let result: unknown;
      try {
        switch (endpoint) {
          case "quality/report":
            result = {
              text: qualityReport(
                context,
                new URLSearchParams(query).get("batchId") ?? undefined,
              ),
            };
            break;
          case "mock/appointments":
            result = mockAppointments(context);
            break;
          case "session":
            result = context;
            break;
          case "state":
            result = workspaceState(context, "browser");
            break;
          case "analytics":
            result = analytics(
              context,
              Object.fromEntries(new URLSearchParams(query)),
            );
            break;
          case "search":
            result = searchKnowledge(
              context,
              new URLSearchParams(query).get("q") ?? "",
            );
            break;
          case "export":
            result = exportTickets(context, new URLSearchParams(query));
            break;
          case "role":
            if (!roles.includes(input?.role as Role))
              throw new AppError("无效角色");
            context = { ...context, role: input!.role as Role };
            audit(context, "demo.role_changed", context.workspace);
            result = context;
            break;
          case "reset":
            if (input?.confirm !== "NEW_WORKSPACE")
              throw new AppError("请确认新建演示空间");
            newWorkspace();
            result = context;
            break;
          case "upload": {
            const file = input?.file;
            if (!(file instanceof File) || file.size > 2_000_000)
              throw new AppError("文件上限为 2MB");
            if (!/\.(txt|md)$/i.test(file.name))
              throw new AppError(
                "浏览器演示支持 TXT / Markdown；PDF 请使用本地服务端模式",
              );
            result = saveDocument(context, {
              title: file.name,
              content: await file.text(),
              source: "",
            });
            break;
          }
          default:
            result = await operation(context, endpoint, body, onProgress);
        }
        await persist();
        return result as T;
      } catch (e) {
        await persist();
        throw e;
      }
    };
    return navigator.locks
      ? navigator.locks.request("upcare-database", work)
      : work();
  };
  const next = sequence.then(run, run);
  sequence = next.catch(() => {});
  return next;
}
