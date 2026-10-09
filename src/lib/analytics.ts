import { list } from "./repository";
import type { Context, Run, Ticket, Quality } from "./types";
export function analytics(
  ctx: Context,
  filters: { clinic?: string; from?: string; to?: string } = {},
) {
  const within = (date: string) =>
    (!filters.from || date.slice(0, 10) >= filters.from) &&
    (!filters.to || date.slice(0, 10) <= filters.to);
  const tickets = list<Ticket>(ctx, "ticket").filter(
    (r) =>
      within(r.createdAt) &&
      (!filters.clinic || r.data.clinic === filters.clinic),
  );
  const runs = list<Run>(ctx, "run").filter(
    (r) =>
      within(r.createdAt) &&
      (!filters.clinic || r.data.intent?.clinic === filters.clinic),
  );
  const quality = list<Quality>(ctx, "quality").filter(
    (r) =>
      within(r.createdAt) &&
      (!filters.clinic || r.data.clinic === filters.clinic),
  );
  const days = [
    ...new Set([...tickets, ...runs].map((r) => r.createdAt.slice(0, 10))),
  ].sort();
  const durations = tickets
    .filter((t) => t.data.status === "completed")
    .map((t) => Math.max(0, Date.parse(t.updatedAt) - Date.parse(t.createdAt)));
  return {
    filters,
    trend: days.map((date) => ({
      date,
      runs: runs.filter((r) => r.createdAt.startsWith(date)).length,
      tickets: tickets.filter((t) => t.createdAt.startsWith(date)).length,
    })),
    states: ["pending", "approved", "in_progress", "completed", "rejected"].map(
      (status) => ({
        status,
        count: tickets.filter((t) => t.data.status === status).length,
      }),
    ),
    intents: ["appointment", "insurance", "clinic", "medical", "unknown"].map(
      (intent) => ({
        intent,
        count: runs.filter((r) => r.data.intent?.intent === intent).length,
      }),
    ),
    riskTypes: quality
      .flatMap((q) => q.data.risks)
      .reduce<Record<string, number>>(
        (a, r) => ({ ...a, [r.type]: (a[r.type] ?? 0) + 1 }),
        {},
      ),
    retrievalHitRate: runs.length
      ? runs.filter((r) => r.data.citations.length > 0).length / runs.length
      : null,
    meanResolutionMs: durations.length
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : null,
    failures: runs.filter((r) => r.data.status === "failed").length,
    runCount: runs.length,
    ticketCount: tickets.length,
  };
}
