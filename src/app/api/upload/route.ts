import { NextRequest, NextResponse } from "next/server";
import { AppError, authorize } from "@/lib/db";
import { session, validateOrigin } from "@/lib/session";
import { saveDocument } from "@/lib/knowledge";
export const runtime = "nodejs";
export async function POST(req: NextRequest) {
  try {
    validateOrigin(req);
    const ctx = session(req);
    authorize(ctx, ["admin", "reviewer"]);
    if (Number(req.headers.get("content-length") ?? 0) > 2_000_000)
      throw new AppError("文件上限为 2MB", 413);
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new AppError("请选择文件");
    if (file.size > 2_000_000) throw new AppError("文件上限为 2MB", 413);
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!["txt", "md", "pdf"].includes(ext ?? ""))
      throw new AppError("仅支持 TXT、Markdown、PDF");
    let content: string;
    if (ext === "pdf") {
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({
        data: new Uint8Array(await file.arrayBuffer()),
      });
      try {
        content = (await parser.getText()).text;
      } finally {
        await parser.destroy();
      }
    } else content = await file.text();
    return NextResponse.json(
      saveDocument(ctx, { title: file.name, content, source: "" }),
    );
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof AppError
            ? e.message
            : "文件解析或内容校验失败；扫描 PDF 尚不支持 OCR",
      },
      { status: e instanceof AppError ? e.status : 400 },
    );
  }
}
