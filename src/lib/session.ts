import {randomBytes,randomUUID} from 'node:crypto';
import {NextRequest,NextResponse} from 'next/server';
import {db,AppError,audit,transaction} from './db';
import {seedKnowledge} from './knowledge';
import {roles,type Context,type Role} from './types';
const cookie='upcare_session';
export function createSession(){return transaction(()=>{const workspace=randomUUID(),token=randomBytes(32).toString('hex');const now=new Date();db().prepare('INSERT INTO workspaces VALUES(?,?)').run(workspace,now.toISOString());db().prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(token,workspace,'service',new Date(now.getTime()+86400000*7).toISOString());seedKnowledge({workspace,role:'admin'});return {token,workspace,role:'service' as Role};});}
export function session(req:NextRequest):Context {const token=req.cookies.get(cookie)?.value;if(!token)throw new AppError('演示会话未初始化，请刷新页面',401);const row=db().prepare('SELECT workspace,role FROM sessions WHERE token=? AND expires_at>?').get(token,new Date().toISOString()) as Context|undefined;if(!row)throw new AppError('会话已过期，请刷新页面',401);return row;}
export function sessionResponse(req:NextRequest){try{return NextResponse.json(session(req));}catch{const s=createSession(),response=NextResponse.json({workspace:s.workspace,role:s.role});response.cookies.set(cookie,s.token,{httpOnly:true,sameSite:'strict',secure:req.nextUrl.protocol==='https:',maxAge:604800,path:'/'});return response;}}
export function changeRole(req:NextRequest,value:unknown){if(!roles.includes(value as Role))throw new AppError('无效角色');const ctx=session(req);db().prepare('UPDATE sessions SET role=? WHERE token=?').run(value as Role,req.cookies.get(cookie)!.value);audit(ctx,'demo.role_changed',ctx.workspace,{role:value});return {...ctx,role:value};}
export function validateOrigin(req:NextRequest){const origin=req.headers.get('origin');if(!origin||origin!==req.nextUrl.origin)throw new AppError('请求来源不允许',403);}
