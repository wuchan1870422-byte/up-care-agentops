"use client";
import type { RecordRow, Run } from "./types";
let browser = false;
export function configureTransport(value: boolean) {
  browser = value;
}
export async function api<T>(path: string, body?: unknown): Promise<T> {
  if (browser) {
    const { browserRequest } = await import("./browser-store");
    return browserRequest<T>(path, body);
  }
  const response = await fetch(
    "/api/" + path,
    body === undefined
      ? { cache: "no-store" }
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "请求失败");
  return data as T;
}
export async function uploadDocument(file: File) {
  if (browser) {
    const { browserRequest } = await import("./browser-store");
    return browserRequest("upload", { file });
  }
  const form = new FormData();
  form.append("file", file);
  const response = await fetch("/api/upload", { method: "POST", body: form });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error);
  return data;
}
export async function downloadTickets(query = "") {
  let csv: string;
  if (browser) {
    const { browserRequest } = await import("./browser-store");
    csv = await browserRequest<string>("export" + query);
  } else {
    const res = await fetch("/api/export" + query);
    if (!res.ok) throw new Error((await res.json()).error);
    csv = await res.text();
  }
  const url = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "upcare-demo-tickets.csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function consultStream(
  body: unknown,
  onProgress: (run: RecordRow<Run>) => void,
) {
  if (browser) {
    const { browserRequest } = await import("./browser-store");
    return browserRequest<RecordRow<Run>>("consult", body, onProgress);
  }
  const response = await fetch("/api/consult", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error((await response.json()).error);
  if (!response.body) throw new Error("执行流不可用");
  const reader = response.body.getReader(),
    decoder = new TextDecoder();
  let buffer = "",
    result: RecordRow<Run> | undefined;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let end: number;
    while ((end = buffer.indexOf("\n\n")) >= 0) {
      const event = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const type = event.match(/^event: (.+)$/m)?.[1],
        data = JSON.parse(event.match(/^data: (.+)$/m)?.[1] ?? "{}");
      if (type === "error") throw new Error(data.error);
      if (type === "progress") onProgress(data);
      if (type === "result") result = data;
    }
  }
  if (!result) throw new Error("执行流已中断，请查看执行历史，重试前核对工单");
  return result;
}
