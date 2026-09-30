import { z } from "zod";

const text = z.string().trim().min(1).max(2500);
export const planSchema = z.object({
  id: z.number().int().positive(),
  name: text,
  style: text,
  squareFootage: z.number().finite().positive(),
  bedrooms: z.number().int().min(1).max(20),
  bathrooms: z.number().finite().positive().max(20),
  stories: z.number().int().min(1).max(5),
  garages: z.number().int().min(0).max(3),
  estimatedCost: z.number().finite().positive(),
  description: text,
  features: z.array(text).min(1).max(20),
  rooms: z.array(z.object({ name: text, sqft: z.number().finite().positive() })).min(1).max(60),
  highlights: z.array(text).min(1).max(10),
});
export type GeneratedPlan = z.infer<typeof planSchema>;

export class PlanOutputError extends Error {
  constructor(public readonly code: "TRUNCATED" | "INVALID_JSON" | "INVALID_SCHEMA", public readonly fields: readonly string[] = []) {
    super(code);
  }
}

/** Do not pass model prose or partial JSON into rendering/PDF code. No paid retries. */
export function parsePlanOutput(raw: string, count: 1 | 3, stopReason: string | null): GeneratedPlan[] {
  if (stopReason !== "end_turn") throw new PlanOutputError("TRUNCATED");
  let value: unknown;
  try {
    value = JSON.parse(raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim());
  } catch { throw new PlanOutputError("INVALID_JSON"); }
  const parsed = z.object({ plans: z.array(planSchema).length(count) }).safeParse(value);
  if (!parsed.success) throw new PlanOutputError("INVALID_SCHEMA", parsed.error.issues.slice(0, 8).map(i => `${i.path.join(".")}:${i.code}`));
  if (new Set(parsed.data.plans.map(p => p.id)).size !== count) throw new PlanOutputError("INVALID_SCHEMA", ["plans.id:duplicate"]);
  return parsed.data.plans;
}

/** Heuristics, NOT building-code or architectural validation. Used in eval gates
 * and observability; do not silently alter a buyer's numbers to hide an error.
 */
export function planQualityIssues(plans: GeneratedPlan[], budget: number): string[] {
  const issues: string[] = [];
  for (const p of plans) {
    const prefix = `plan_${p.id}`;
    if (p.estimatedCost > budget) issues.push(`${prefix}:over_budget`);
    const livingArea = p.rooms.filter(r => !/garage/i.test(r.name)).reduce((sum, r) => sum + r.sqft, 0);
    if (Math.abs(livingArea - p.squareFootage) > p.squareFootage * 0.02) issues.push(`${prefix}:room_area_mismatch`);
    const beds = p.rooms.filter(r => /bedroom|primary suite/i.test(r.name)).length;
    const baths = p.rooms.reduce((sum, r) => sum + (/powder|half bath/i.test(r.name) ? 0.5 : /bath(?:room)?|ensuite/i.test(r.name) ? 1 : 0), 0);
    if (beds !== p.bedrooms) issues.push(`${prefix}:bedroom_count_mismatch`);
    if (baths !== p.bathrooms) issues.push(`${prefix}:bathroom_count_mismatch`);
  }
  return issues;
}
