import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
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
export const CAMPAIGN_CHANNELS = ["linkedin", "email", "referral", "inbound"] as const;
export const OUTREACH_CHANNELS = ["linkedin", "email", "call", "webinar"] as const;
export const OUTREACH_TYPES = ["connect_request", "connect_accepted", "dm", "comment", "email_sent", "email_open", "email_reply", "portal_open", "call", "follow_up"] as const;
export const OUTREACH_DIRECTIONS = ["outbound", "inbound"] as const;
export const OUTREACH_SENTIMENTS = ["pos", "neutral", "neg"] as const;
export const SUPPRESSION_REASONS = ["unsubscribe", "bounce_hard", "complaint", "manual", "competitor"] as const;
export const UNSUBSCRIBE_SOURCES = ["email_link", "reply", "manual"] as const;

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

export function normalizeGrowthEmail(value: unknown): string | null {
  const email = cleanString(value, 255)?.toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

export function normalizeGrowthDomain(value: unknown): string | null {
  const raw = cleanString(value, 255)?.toLowerCase();
  if (!raw) return null;

  const domain = raw
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .replace(/^@/, "")
    .replace(/\.$/, "");

  if (!domain || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return null;
  return domain;
}

export function domainFromGrowthEmail(email: string): string | null {
  const normalized = normalizeGrowthEmail(email);
  if (!normalized) return null;
  return normalized.split("@")[1] ?? null;
}

export async function isGrowthSuppressed(
  supabase: SupabaseClient,
  email: string,
): Promise<boolean> {
  const normalizedEmail = normalizeGrowthEmail(email);
  if (!normalizedEmail) return false;

  const { data: emailMatches, error: emailError } = await supabase
    .from("growth_suppression_list")
    .select("id")
    .ilike("email", normalizedEmail)
    .limit(1);

  if (emailError) {
    console.error("[growth/suppression] email check failed:", emailError.message);
    return true;
  }
  if ((emailMatches ?? []).length > 0) return true;

  const domain = domainFromGrowthEmail(normalizedEmail);
  if (!domain) return false;

  const { data: domainMatches, error: domainError } = await supabase
    .from("growth_suppression_list")
    .select("id")
    .eq("domain", domain)
    .limit(1);

  if (domainError) {
    console.error("[growth/suppression] domain check failed:", domainError.message);
    return true;
  }

  return (domainMatches ?? []).length > 0;
}

export async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  return body as Record<string, unknown>;
}
