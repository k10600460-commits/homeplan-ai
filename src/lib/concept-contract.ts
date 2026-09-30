import { z } from "zod";
import { planSchema, PlanOutputError, type GeneratedPlan } from "./plan-output";
import { getMarketPack, type Market } from "./market";

export const CONCEPT_VERSION = "room-ledger-2026-09-30";
export const roomKinds = ["bedroom", "full_bath", "half_bath", "garage", "living", "service", "circulation"] as const;
const room = z.object({
  name: z.string().trim().min(1).max(100), sqft: z.number().finite().positive().max(50_000),
  kind: z.enum(roomKinds),
}).strict();
export const conceptDraftSchema = planSchema.omit({ squareFootage: true, bedrooms: true, bathrooms: true, rooms: true })
  .extend({ rooms: z.array(room).min(4).max(60) }).strict();
export type ConceptBrief = { market: Market; lotSize: number; budget: number; familySize: number; state?: string | null; zoningLine?: string };
export type CalculatedPlan = Omit<GeneratedPlan, "rooms"> & {
  rooms: z.infer<typeof room>[];
  calculationBasis: typeof CONCEPT_VERSION;
};

/** A single source of truth: models supply a room ledger, NEVER independent
 * totals to "repair" after the fact. Historical plans are not modified. */
export function calculateConcepts(raw: string, count: 1 | 3, stopReason: string | null): CalculatedPlan[] {
  if (stopReason !== "end_turn") throw new PlanOutputError("TRUNCATED");
  let input: unknown;
  try { input = JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "")); }
  catch { throw new PlanOutputError("INVALID_JSON"); }
  const checked = z.object({ plans: z.array(conceptDraftSchema).length(count) }).strict().safeParse(input);
  if (!checked.success) throw new PlanOutputError("INVALID_SCHEMA", checked.error.issues.slice(0, 8).map(i => `${i.path.join(".")}:${i.code}`));
  const drafts = checked.data.plans;
  if (new Set(drafts.map(p => p.id)).size !== count) throw new PlanOutputError("INVALID_SCHEMA", ["plans.id:duplicate"]);
  return drafts.map(p => {
    const sum = p.rooms.filter(r => r.kind !== "garage").reduce((n, r) => n + r.sqft, 0);
    const totals = {
      squareFootage: Math.round(sum * 100) / 100,
      bedrooms: p.rooms.filter(r => r.kind === "bedroom").length,
      bathrooms: p.rooms.reduce((n, r) => n + (r.kind === "full_bath" ? 1 : r.kind === "half_bath" ? 0.5 : 0), 0),
    };
    const parsed = planSchema.safeParse({ ...p, ...totals });
    if (!parsed.success) throw new PlanOutputError("INVALID_SCHEMA", ["plans:invalid_calculated_totals"]);
    return { ...parsed.data, rooms: p.rooms, calculationBasis: CONCEPT_VERSION };
  });
}

/** Shared semantic checks for ALL providers. These are concept checks, NOT
 * architectural, construction-cost, building-code or zoning certification. */
export function conceptIssues(plans: readonly CalculatedPlan[], brief: ConceptBrief): string[] {
  const issues: string[] = [];
  const requiredBeds = Math.max(2, Math.ceil(brief.familySize * 0.7));
  for (const p of plans) {
    const prefix = `plan_${p.id}:`;
    if (p.estimatedCost > brief.budget) issues.push(prefix + "over_budget");
    if (p.bedrooms < requiredBeds) issues.push(prefix + "insufficient_bedrooms");
    if (!p.rooms.some(r => r.kind === "full_bath")) issues.push(prefix + "missing_full_bath");
    if (!p.rooms.some(r => /kitchen/i.test(r.name))) issues.push(prefix + "missing_kitchen");
    if (!p.rooms.some(r => /great room|living|lounge/i.test(r.name))) issues.push(prefix + "missing_living_room");
    if (!p.rooms.some(r => r.kind === "circulation")) issues.push(prefix + "missing_circulation_allowance");
    if ((p.garages > 0) !== p.rooms.some(r => r.kind === "garage")) issues.push(prefix + "garage_schedule_mismatch");
    if (new Set(p.rooms.map(r => r.name.trim().toLowerCase())).size !== p.rooms.length) issues.push(prefix + "duplicate_room_name");
    for (const r of p.rooms) {
      // Catch misleading categorization instead of achieving a false clean score.
      const labelKind = /\bgarage\b/i.test(r.name) ? "garage" : /\bpowder\b|half.?bath/i.test(r.name) ? "half_bath" :
        /\bbath(?:room)?\b|\bensuite\b|en.suite/i.test(r.name) ? "full_bath" : /\bbedroom\b/i.test(r.name) ? "bedroom" : null;
      if (labelKind && labelKind !== r.kind) issues.push(prefix + "room_kind_name_mismatch");
      if (r.kind === "bedroom" && /\bprimary suite\b/i.test(r.name)) issues.push(prefix + "ambiguous_combined_suite");
      if (r.kind === "bedroom" && r.sqft < 70) issues.push(prefix + "bedroom_area_implausible");
    }
    // Rough screening only. It cannot prove setbacks or actual footprint fit.
    const garageArea = p.rooms.filter(r => r.kind === "garage").reduce((n, r) => n + r.sqft, 0);
    if (p.squareFootage / p.stories + garageArea > brief.lotSize * 0.4) issues.push(prefix + "footprint_exceeds_concept_assumption");
  }
  if (plans.length > 1 && new Set(plans.map(p => p.style.trim().toLowerCase())).size !== plans.length) issues.push("plans:styles_not_distinct");
  return [...new Set(issues)];
}

/** Use the intersection supported by both providers, then enforce the stricter
 * Zod contract locally. No schema constraints are silently trusted. */
export function conceptJsonSchema(count: 1 | 3): Record<string, unknown> {
  const source = z.toJSONSchema(z.object({ plans: z.array(conceptDraftSchema).length(count) }).strict());
  function portable(v: unknown): unknown {
    if (Array.isArray(v)) return v.map(portable);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).filter(([k]) =>
      !["$schema", "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "minLength", "maxLength", "minItems", "maxItems"].includes(k)
    ).map(([k, value]) => [k, portable(value)]));
    return v;
  }
  return portable(source) as Record<string, unknown>;
}

export function conceptPrompt(brief: ConceptBrief, count: 1 | 3) {
  const pack = getMarketPack(brief.market);
  return {
    system: `Create preliminary residential sales concepts, not permit-ready drawings or verified construction quotes. Do not claim professional credentials, site verification, code compliance, approvals, or exact construction pricing.
Return ONLY JSON matching the supplied schema. Generate exactly ${count} plan(s), with distinct styles and practical trade-offs. Keep descriptions short (2 sentences), features to 5, and highlights to 3. Highlights should state a practical benefit or trade-off, not sales hype.
The room schedule is the only numeric source of truth. DO NOT output squareFootage, bedrooms or bathrooms: the app calculates them from rooms. Each bedroom, full bath, half bath, closet and garage must be a SEPARATE room, never a combined Primary Suite. Use Primary Bedroom and Primary Bath, never master. Every room has sqft in square feet and a kind: bedroom, full_bath, half_bath, garage, living, service or circulation. A half bath is 0.5. Name half baths Powder Room or Half Bath. Do not hide bedrooms/baths in other kinds. Include halls, stairs and internal wall allowance as circulation so the schedule covers the interior area. Exclude garage area from living area. garages is the integer number of vehicle bays (0–3).
Fit the stated construction budget and household. Budget excludes land and financing. Estimate living area / stories + garage area at no more than 40% of lot area as a preliminary screening assumption, NOT verified zoning. Prefer a smaller home or fewer garage bays to an unrealistic budget. Do not pad area with implausible circulation. Separate private bedrooms from the shared living zone; describe kitchen, entry and storage relationships concretely.
Localize vocabulary and architectural choices to ${pack.label}. Currency is ${pack.currency}. Numeric room areas remain square feet for app compatibility; ${pack.areaUnit === "m2" ? "use m² and metres in prose if mentioning dimensions" : "use square feet in prose"}. Do not assume US construction prices in other markets. All costs are indicative and need local builder verification.`,
    user: `Create ${count} concept(s). Market: ${pack.label}. Lot: ${brief.lotSize} square feet. Construction budget cap: ${brief.budget} ${pack.currency}. Household: ${brief.familySize}. Each plan needs at least ${Math.max(2, Math.ceil(brief.familySize * 0.7))} bedrooms. ${brief.state ? `Region: ${brief.state}.` : ""}\n${brief.zoningLine ?? ""}`,
  };
}
