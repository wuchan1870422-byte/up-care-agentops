import {NextRequest,NextResponse} from 'next/server';
import {z,ZodError} from 'zod';
import {AppError,audit,auditList,authorize,create,db,get,list,transaction,update} from '@/lib/db';
import {changeRole,session,sessionResponse,validateOrigin} from '@/lib/session';
import {accessibleDocuments,saveDocument,searchKnowledge} from '@/lib/knowledge';
import {dashboard,runConsultation,workflowDefinitions} from '@/lib/workflow';
import {decideApproval,executeTool} from '@/lib/tools';
import {runResponseQualityCheck,soapDraft,textSchema} from '@/lib/rules';
import {saveEvaluation} from '@/lib/evaluation';
import {cozeStatus} from '@/lib/coze';
import type {Context,Quality,RecordRow,Ticket} from '@/lib/types';
export const runtime='nodejs';
export const dynamic='force-dynamic';
type Params={params:Promise<{path:string[]}>};
const json=(data:unknown)=>NextResponse.json(data,{headers:{'Cache-Control':'no-store'}});
function failure(e:unknown){if(e instanceof ZodError)return jsonError('输入校验失败：'+e.issues.map(i=>i.path.join('.')+' '+i.message).join('; '),400);if(e instanceof AppError)return jsonError(e.message,e.status);console.error('API operation failed',e instanceof Error?e.name:'UnknownError');return jsonError('服务器处理失败，请查看运行记录或重试',500);}
const jsonError=(error:string,status:number)=>NextResponse.json({error},{status,headers:{'Cache-Control':'no-store'}});
export async function GET(req:NextRequest,{params}:Params){try{const path=(await params).path.join('/');if(path==='session')return sessionResponse(req);const ctx=session(req);switch(path){case 'state':return json({role:ctx.role,workspace:ctx.workspace,mode:'demo',dashboard:dashboard(ctx),conversations:list(ctx,'conversation'),runs:list(ctx,'run'),tickets:list(ctx,'ticket'),approvals:list(ctx,'approval'),qualities:list(ctx,'quality'),documents:accessibleDocuments(ctx),followups:list(ctx,'followup'),notes:['reviewer','admin'].includes(ctx.role)?list(ctx,'note'):[],evaluations:list(ctx,'evaluation'),audit:auditList(ctx),workflows:workflowDefinitions,integrations:{llm:{connected:false},embedding:{connected:false},coze:cozeStatus(),crm:{connected:false}}});case 'search':return json(searchKnowledge(ctx,req.nextUrl.searchParams.get('q')??''));case 'export':{authorize(ctx,['manager','admin']);const tickets=list<Ticket>(ctx,'ticket');const safe=(v:unknown)=>'"'+String(v??'').replace(/^[=+@\-\t\r]/,"'$&").replaceAll('"','""')+'"';const csv=['id,title,clinic,status,created_at',...tickets.map(t=>[t.id,t.data.title,t.data.clinic,t.data.status,t.createdAt].map(safe).join(','))].join('\r\n');audit(ctx,'tickets.exported','',{count:tickets.length});return new NextResponse('\uFEFF'+csv,{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="upcare-demo-tickets.csv"','Cache-Control':'no-store'}});}default:throw new AppError('接口不存在',404);}}catch(e){return failure(e);}}
async function boundedJson(req:NextRequest){if(Number(req.headers.get('content-length')??0)>200000)throw new AppError('请求过大',413);const reader=req.body?.getReader();if(!reader)throw new AppError('缺少请求内容');let size=0;const parts:Uint8Array[]=[];for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>200000){await reader.cancel();throw new AppError('请求过大',413);}parts.push(value);}try{return JSON.parse(Buffer.concat(parts).toString('utf8')) as unknown;}catch{throw new AppError('JSON 格式错误');}}
function quota(ctx:Context){const n=db().prepare("SELECT count(*) AS n FROM records WHERE workspace=?").get(ctx.workspace) as {n:number};if(n.n>2000)throw new AppError('本演示空间已达容量上限，请新建演示空间',429);}
export async function POST(req:NextRequest,{params}:Params){try{validateOrigin(req);const path=(await params).path.join('/');const ctx=session(req);quota(ctx);const raw=await boundedJson(req);const body=z.record(z.string(),z.unknown()).parse(raw);switch(path){
 case 'role':return json(changeRole(req,body.role));
 case 'consult':return json(await runConsultation(ctx,body));
 case 'approve':return json(decideApproval(ctx,body));
 case 'ticket':return json(executeTool(ctx,'createServiceTicket',body));
 case 'ticket/status':return json(executeTool(ctx,'updateTicketStatus',body));
 case 'ticket/assign':{authorize(ctx,['operator','manager','admin']);const p=z.object({id:z.string().uuid(),assignedTo:z.string().trim().min(1).max(100),note:z.string().max(1000).default('')}).parse(body);return json(transaction(()=>{const row=get<Ticket>(ctx,p.id,'ticket');const result=update(ctx,row.id,{...row.data,assignedTo:p.assignedTo,notes:[...row.data.notes,...(p.note?[p.note]:[])]});audit(ctx,'ticket.assigned',row.id,{assignedTo:p.assignedTo});return result;}));}
 case 'quality':{authorize(ctx,['service','operator','reviewer','admin']);const p=z.object({texts:z.array(textSchema).min(1).max(20)}).parse(body);return json(transaction(()=>p.texts.map(text=>{const citations=searchKnowledge(ctx,'客服 医疗 保险 规范');const row=create(ctx,'quality',runResponseQualityCheck(text,citations));audit(ctx,'quality.created',row.id,{riskCount:row.data.risks.length});return row;})));}
 case 'quality/review':{authorize(ctx,['reviewer','admin']);const p=z.object({id:z.string().uuid(),note:z.string().trim().min(2).max(2000)}).parse(body);const row=get<Quality>(ctx,p.id,'quality');const result=update(ctx,row.id,{...row.data,status:'reviewed',reviewerNote:p.note});audit(ctx,'quality.reviewed',row.id,{note:p.note,previous:row.data.reviewerNote??null});return json(result);}
 case 'document':return json(saveDocument(ctx,body));
 case 'evaluate':authorize(ctx,['manager','admin']);return json(saveEvaluation(ctx));
 case 'followup':{authorize(ctx,['operator','reviewer','admin']);const p=z.object({text:textSchema,key:z.string().min(8).max(100)}).parse(body);const lines=p.text.split(/\n/).filter(Boolean);const unresolved=lines.filter(s=>/待|仍|未|问题|疼|痛|pending|still|pain|question/i.test(s));const ticket=executeTool(ctx,'createServiceTicket',{title:'随访跟进：'+p.text.slice(0,100),priority:'high',key:p.key+':ticket'}) as RecordRow<Ticket>;const task=executeTool(ctx,'createFollowUpTask',{ticketId:ticket.id,summary:lines.slice(-3).join('\n'),key:p.key+':task'}) as RecordRow;executeTool(ctx,'requestHumanReview',{targetId:ticket.id,targetKind:'ticket',reason:'核实原文中的未解决事项，需要时转专业人员',key:p.key+':approval'});return json({...task,unresolved,draft:'请由服务人员核实待跟进事项。涉及症状判断的部分交由专业人员处理。',summaryMethod:'原文摘录，非模型总结'});}
 case 'soap':{authorize(ctx,['reviewer','admin']);const p=z.object({text:textSchema}).parse(body);const note=create(ctx,'note',soapDraft(p.text));executeTool(ctx,'requestHumanReview',{targetId:note.id,targetKind:'note',reason:'未经专业人员审核的事实整理草稿',key:note.id+':approval'});return json(note);}
 case 'reset':{if(body.confirm!=='NEW_WORKSPACE')throw new AppError('请确认新建独立演示空间');const empty=new NextRequest(req.url);return sessionResponse(empty);}
 default:throw new AppError('接口不存在',404);
 }}catch(e){return failure(e);}}
