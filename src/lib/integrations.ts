import { z } from "zod";
import { authorize, audit, create, get, idempotent, list } from "./repository";
import type { Context } from "./types";
export function mockAppointments(ctx: Context) {
  return {
    provider: "Self-built Mock Appointment API",
    realSystemConnected: false,
    availability: "unverified",
    items: list(ctx, "appointment"),
  };
}
export function syncMockCRM(ctx: Context, input: unknown) {
  authorize(ctx, ["admin", "operator"]);
  const p = z
    .object({ leadId: z.string().uuid(), key: z.string().min(8).max(200) })
    .parse(input);
  const lead = get(ctx, p.leadId, "lead");
  return idempotent(ctx, p.key, JSON.stringify(p), () => {
    const row = create(ctx, "integration", {
      provider: "Mock CRM",
      realSystemConnected: false,
      leadId: lead.id,
      externalId: "mock-" + lead.id,
      status: "synced_locally",
    });
    audit(ctx, "mock.crm_synced", row.id, { leadId: lead.id });
    return row;
  });
}
