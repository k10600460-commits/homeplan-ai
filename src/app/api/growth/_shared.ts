import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";

export const MASTER_USER_ID = "12d6d041-dc0a-4772-8aa7-d71fa2ff43a7";

export const COMPANY_STATUSES = ["new", "researching", "active", "nurture", "won", "lost", "disqualified"] as const;
export const TIERS = ["A", "B", "C"] as const;
export const SIZE_BANDS = ["1-49", "~100", "100+"] as const;
export const BUILDER_TYPES = ["custom", "semi-custom", "spec", "mixed"] as const;
export const COMPANY_SOURCES = ["apollo", "manual", "referral", "inbound", "launch-batch"] as const;
export const CONTACT_ROLES = ["owner", "sales", "other"] as const;
export const EMAIL_STATUSES = ["unverified", "valid", "risky", "invalid"] as const;
export const LEAD_STAGES = ["to_contact", "contacted", "replied", "demo_scheduled", "trial", "won", "lost"] as const;
export const LEAD_CHANNELS = ["linkedin", "email", "referral", "inbound"] as const;
export const LEAD_OWNERS = ["shoji", "va"] as const;

export async function requireGrowthMaster() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  if (user.id !== MASTER_USER_ID) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { supabase, user };
}

export function isAllowed<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
): value is T[number] {
  return typeof value === "string" && (allowed as readonly string[]).includes(value);
}

export function cleanString(value: unknown, maxLength = 500): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

export function nullableString(value: unknown, maxLength = 500): string | null | undefined {
  if (value === undefined) return undefined;
  return cleanString(value, maxLength);
}

export async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  return body as Record<string, unknown>;
}
