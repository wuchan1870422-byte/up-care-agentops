import { analytics } from "@/lib/analytics";
import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError } from "@/lib/db";
import {
  changeRole,
  session,
  sessionResponse,
  validateOrigin,
} from "@/lib/session";
import { searchKnowledge } from "@/lib/knowledge";
import { cozeStatus, runCoze } from "@/lib/coze";
import { workspaceState, operation, exportTickets } from "@/lib/operations";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Params = { params: Promise<{ path: string[] }> };
const json = (data: unknown) =>
  NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
function failure(e: unknown) {
  const status =
    e instanceof AppError ? e.status : e instanceof ZodError ? 400 : 500;
  const error =
    e instanceof AppError
      ? e.message
      : e instanceof ZodError
        ? "输入校验失败：" +
          e.issues.map((i) => i.path.join(".") + " " + i.message).join("; ")
        : "服务器处理失败，请查看运行记录或重试";
  return NextResponse.json(
    { error },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const path = (await params).path.join("/");
    if (path === "health")
      return json({
        status: "ok",
        mode: "demo",
        storage: process.env.VERCEL ? "browser" : "sqlite",
        modelCalled: false,
      });
    if (process.env.VERCEL)
      throw new AppError(
        "公开演示在浏览器中独立保存数据，未配置共享服务器数据库",
        503,
      );
    if (path === "session") return sessionResponse(req);
    const ctx = session(req);
    switch (path) {
      case "state":
        return json({
          ...workspaceState(ctx),
          integrations: {
            llm: { connected: false },
            embedding: { connected: false },
            coze: cozeStatus(),
            crm: { connected: false },
          },
        });
      case "analytics":
        return json(
          analytics(ctx, Object.fromEntries(req.nextUrl.searchParams)),
        );
      case "search":
        return json(
          searchKnowledge(ctx, req.nextUrl.searchParams.get("q") ?? ""),
        );
      case "export":
        return new NextResponse(exportTickets(ctx, req.nextUrl.searchParams), {
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition":
              'attachment; filename="upcare-demo-tickets.csv"',
            "Cache-Control": "no-store",
          },
        });
      default:
        throw new AppError("接口不存在", 404);
    }
  } catch (e) {
    return failure(e);
  }
}
async function boundedJson(req: NextRequest) {
  if (Number(req.headers.get("content-length") ?? 0) > 200000)
    throw new AppError("请求过大", 413);
  const reader = req.body?.getReader();
  if (!reader) throw new AppError("缺少请求内容");
  let size = 0;
  const parts: Uint8Array[] = [];
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 200000) {
      await reader.cancel();
      throw new AppError("请求过大", 413);
    }
    parts.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(parts).toString("utf8")) as Record<
      string,
      unknown
    >;
  } catch {
    throw new AppError("JSON 格式错误");
  }
}
export async function POST(req: NextRequest, { params }: Params) {
  try {
    if (process.env.VERCEL)
      throw new AppError("公开演示使用浏览器独立存储", 503);
    validateOrigin(req);
    const path = (await params).path.join("/");
    const ctx = session(req);
    const body = await boundedJson(req);
    if (path === "role") return json(changeRole(req, body.role));
    if (path === "reset") {
      if (body.confirm !== "NEW_WORKSPACE")
        throw new AppError("请确认新建独立演示空间");
      return sessionResponse(new NextRequest(req.url));
    }
    if (path === "coze") return json(await runCoze(ctx, body));
    if (
      path === "consult" &&
      req.headers.get("accept") === "text/event-stream"
    ) {
      const encoder = new TextEncoder();
      let closed = false;
      const stream = new ReadableStream({
        async start(controller) {
          const emit = (event: string, data: unknown) => {
            if (!closed)
              controller.enqueue(
                encoder.encode(
                  "event: " +
                    event +
                    "\ndata: " +
                    JSON.stringify(data) +
                    "\n\n",
                ),
              );
          };
          try {
            const result = await operation(ctx, path, body, (run) =>
              emit("progress", run),
            );
            emit("result", result);
          } catch (e) {
            emit("error", {
              error: e instanceof AppError ? e.message : "工作流执行失败",
            });
          } finally {
            if (!closed) controller.close();
          }
        },
        cancel() {
          closed = true;
        },
      });
      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          "X-Accel-Buffering": "no",
        },
      });
    }
    return json(await operation(ctx, path, body));
  } catch (e) {
    return failure(e);
  }
}
