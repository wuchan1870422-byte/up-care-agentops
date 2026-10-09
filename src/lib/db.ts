import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Context, Kind, RecordRow } from './types';

let connection: DatabaseSync | undefined;
export function db() {
  if (!connection) {
    if (process.env.VERCEL) throw new Error('SQLite local adapter cannot run on Vercel. Configure a cloud database adapter first.');
    const path = process.env.DATABASE_PATH || resolve('data/agentops.sqlite');
    if (path !== ':memory:') mkdirSync(dirname(path), {recursive:true});
    connection = new DatabaseSync(path);
    connection.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS workspaces(id TEXT PRIMARY KEY, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, workspace TEXT NOT NULL REFERENCES workspaces(id), role TEXT NOT NULL, expires_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS records(id TEXT PRIMARY KEY, workspace TEXT NOT NULL REFERENCES workspaces(id), kind TEXT NOT NULL, data TEXT NOT NULL CHECK(json_valid(data)), created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS records_scope ON records(workspace,kind,created_at);
      CREATE TABLE IF NOT EXISTS audit(id TEXT PRIMARY KEY, workspace TEXT NOT NULL REFERENCES workspaces(id), role TEXT NOT NULL, action TEXT NOT NULL, target TEXT NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS audit_scope ON audit(workspace,created_at);
      CREATE TABLE IF NOT EXISTS idempotency(workspace TEXT NOT NULL REFERENCES workspaces(id), key TEXT NOT NULL, fingerprint TEXT NOT NULL, result TEXT NOT NULL, PRIMARY KEY(workspace,key));
      INSERT OR IGNORE INTO migrations VALUES(1,datetime('now'));`);
  }
  return connection;
}
export function transaction<T>(fn:()=>T):T { const d=db(); d.exec('BEGIN IMMEDIATE'); try {const result=fn();d.exec('COMMIT');return result;}catch(e){d.exec('ROLLBACK');throw e;} }
function decode<T>(r:unknown):RecordRow<T> { const v=r as {id:string;workspace:string;kind:Kind;data:string;created_at:string;updated_at:string};return {id:v.id,workspace:v.workspace,kind:v.kind,data:JSON.parse(v.data) as T,createdAt:v.created_at,updatedAt:v.updated_at}; }
export function list<T = Record<string,unknown>>(ctx:Context,kind:Kind):RecordRow<T>[] {return db().prepare('SELECT * FROM records WHERE workspace=? AND kind=? ORDER BY created_at DESC,rowid DESC').all(ctx.workspace,kind).map(r=>decode<T>(r));}
export function get<T>(ctx:Context,id:string,kind?:Kind):RecordRow<T> { const row=db().prepare('SELECT * FROM records WHERE workspace=? AND id=?').get(ctx.workspace,id);if(!row)throw new AppError('记录不存在',404);const parsed=decode<T>(row);if(kind&&parsed.kind!==kind)throw new AppError('记录类型不匹配',400);return parsed; }
export function create<T>(ctx:Context,kind:Kind,data:T):RecordRow<T> {const id=randomUUID(),now=new Date().toISOString();db().prepare('INSERT INTO records VALUES(?,?,?,?,?,?)').run(id,ctx.workspace,kind,JSON.stringify(data),now,now);return {id,workspace:ctx.workspace,kind,data,createdAt:now,updatedAt:now};}
export function update<T>(ctx:Context,id:string,data:T) {get(ctx,id);db().prepare('UPDATE records SET data=?,updated_at=? WHERE id=? AND workspace=?').run(JSON.stringify(data),new Date().toISOString(),id,ctx.workspace);return get<T>(ctx,id);}
export function audit(ctx:Context,action:string,target:string,detail:unknown={}) {db().prepare('INSERT INTO audit VALUES(?,?,?,?,?,?,?)').run(randomUUID(),ctx.workspace,ctx.role,action,target,JSON.stringify(detail),new Date().toISOString());}
export function auditList(ctx:Context) {return db().prepare('SELECT id,role,action,target,detail,created_at FROM audit WHERE workspace=? ORDER BY rowid DESC LIMIT 300').all(ctx.workspace);}
export function idempotent<T>(ctx:Context,key:string,fingerprint:string,fn:()=>T):T {return transaction(()=>{const row=db().prepare('SELECT * FROM idempotency WHERE workspace=? AND key=?').get(ctx.workspace,key) as {fingerprint:string;result:string}|undefined;if(row){if(row.fingerprint!==fingerprint)throw new AppError('幂等键已用于不同请求',409);return JSON.parse(row.result) as T;}const result=fn();db().prepare('INSERT INTO idempotency VALUES(?,?,?,?)').run(ctx.workspace,key,fingerprint,JSON.stringify(result));return result;});}
export class AppError extends Error {constructor(message:string,public status=400){super(message);}}
export function authorize(ctx:Context,allowed:Context['role'][]) {if(!allowed.includes(ctx.role))throw new AppError('当前角色无权执行此操作',403);}
