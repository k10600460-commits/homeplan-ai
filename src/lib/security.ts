// ── Input validation + prompt injection prevention ───────────────────────────
// lotSize, budget, familySize are passed into the Claude prompt.
// Coercing to Number prevents string injection; range checks prevent abuse.

const BOUNDS = {
  lotSize:    { min: 500,    max: 1_000_000 }, // sq ft: 500 → ~23 acres
  budget:     { min: 50_000, max: 50_000_000 }, // $50K → $50M
  familySize: { min: 1,      max: 20 },
} as const;

export interface ValidatedGenerateInput {
  lotSize: number;
  budget: number;
  familySize: number;
}

export function validateGenerateInput(raw: Record<string, unknown>): ValidatedGenerateInput {
  const fields = ["lotSize", "budget", "familySize"] as const;

  for (const field of fields) {
    if (raw[field] === undefined || raw[field] === null || raw[field] === "") {
      throw new ValidationError(`Missing required field: ${field}`, 400);
    }
  }

  const lotSize    = Number(raw.lotSize);
  const budget     = Number(raw.budget);
  const familySize = Number(raw.familySize);

  if (!Number.isFinite(lotSize) || lotSize < BOUNDS.lotSize.min || lotSize > BOUNDS.lotSize.max) {
    throw new ValidationError(
      `lotSize must be between ${BOUNDS.lotSize.min.toLocaleString()} and ${BOUNDS.lotSize.max.toLocaleString()} sq ft`,
      400,
    );
  }

  if (!Number.isFinite(budget) || budget < BOUNDS.budget.min || budget > BOUNDS.budget.max) {
    throw new ValidationError(
      `budget must be between $${BOUNDS.budget.min.toLocaleString()} and $${BOUNDS.budget.max.toLocaleString()}`,
      400,
    );
  }

  if (
    !Number.isFinite(familySize) ||
    !Number.isInteger(familySize) ||
    familySize < BOUNDS.familySize.min ||
    familySize > BOUNDS.familySize.max
  ) {
    throw new ValidationError(
      `familySize must be an integer between ${BOUNDS.familySize.min} and ${BOUNDS.familySize.max}`,
      400,
    );
  }

  return { lotSize, budget, familySize };
}

export class ValidationError extends Error {
  constructor(
    message: string,
    public readonly status: number = 400,
  ) {
    super(message);
    this.name = "ValidationError";
  }
}

// ── IP extraction helper ─────────────────────────────────────────────────────
// Prefers x-forwarded-for (set by Vercel/proxies) over socket IP.
export function getClientIp(req: { headers: { get(name: string): string | null } }): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return "unknown";
}
