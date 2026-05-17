// ── In-memory sliding window rate limiter ────────────────────────────────────
// Works per serverless instance; good enough for initial launch.
// Replace with Upstash Redis when scaling to multiple regions.

const rateLimitStore = new Map<string, number[]>();
const WINDOW_MS = 60_000;       // 1 minute
const MAX_REQUESTS_PER_MIN = 5; // per IP per minute for /api/generate

export function checkRateLimit(identifier: string): {
  allowed: boolean;
  remaining: number;
  resetAt: number;
} {
  const now = Date.now();
  const windowStart = now - WINDOW_MS;
  const timestamps = (rateLimitStore.get(identifier) ?? []).filter(
    (t) => t > windowStart,
  );

  const allowed = timestamps.length < MAX_REQUESTS_PER_MIN;
  if (allowed) {
    timestamps.push(now);
    rateLimitStore.set(identifier, timestamps);
  }

  // Reset map entries older than 5 minutes to prevent memory leak
  if (rateLimitStore.size > 10_000) {
    const cutoff = now - 5 * WINDOW_MS;
    for (const [key, times] of rateLimitStore.entries()) {
      if (times.every((t) => t < cutoff)) rateLimitStore.delete(key);
    }
  }

  return {
    allowed,
    remaining: Math.max(0, MAX_REQUESTS_PER_MIN - timestamps.length),
    resetAt: timestamps[0] ? timestamps[0] + WINDOW_MS : now + WINDOW_MS,
  };
}

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
