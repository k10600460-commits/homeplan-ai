import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { decrypt, encrypt, hashIp } from "@/lib/crypto";
import { getClientIp } from "@/lib/security";
import { checkRateLimitDB } from "@/lib/rate-limit-db";
import { normalizeLotDataProvider } from "@/lib/lot-data-provider";
import { resolveMarketFromRequest } from "@/lib/market";
import { getUserPlan } from "@/lib/usage";

// 10 MLS lookups per authenticated user per minute
const MLS_RATE = { limit: 10, windowSec: 60 };

const TRESTLE_API_BASE = "https://api.trestle.com/reso/odata";
const TRESTLE_TOKEN_URL = "https://api.trestle.com/connect/token";

const SELECTED_FIELDS = [
  "ListingId",
  "UnparsedAddress",
  "LotSizeArea",
  "LotSizeUnits",
  "Zoning",
  "ListPrice",
  "StandardStatus",
  "PropertyType",
  "City",
  "StateOrProvince",
  "PostalCode",
  "InternetEntireListingDisplayYN",
  "ListOfficeName",
  "ModificationTimestamp",
].join(",");

async function refreshToken(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  clientIdEnc: string,
  clientSecretEnc: string,
): Promise<string> {
  const clientId     = decrypt(clientIdEnc);
  const clientSecret = decrypt(clientSecretEnc);

  const body = new URLSearchParams({
    grant_type:    "client_credentials",
    client_id:     clientId,
    client_secret: clientSecret,
    scope:         "api",
  });

  const res = await fetch(TRESTLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) throw new Error(`Token refresh failed: ${res.status}`);

  const data = await res.json() as { access_token: string; expires_in: number };
  const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();

  await supabase.from("mls_connections").update({
    access_token_encrypted: encrypt(data.access_token),
    token_expires_at:       expiresAt,
  }).eq("user_id", userId).eq("provider", "trestle");

  // Audit refresh
  supabase.from("mls_audit_logs").insert({
    user_id:  userId,
    action:   "token_refresh",
    metadata: { provider: "trestle" },
  }).then(() => {}, (e) => console.error("[MLS audit]", e));

  return data.access_token;
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Shared DB rate limit (10 req/min per user)
    const rl = await checkRateLimitDB(`mls:user:${user.id}`, MLS_RATE);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please wait." },
        { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
      );
    }

    const { searchParams } = new URL(req.url);
    const market = resolveMarketFromRequest(req);
    const provider = normalizeLotDataProvider(searchParams.get("provider"), market);
    if (provider.id === "manual") {
      return NextResponse.json(
        {
          error: "Manual lot data entry is the default provider; no remote lookup was requested.",
          provider: provider.id,
        },
        { status: 400 },
      );
    }

    // Plan gate: remote lot-data providers (e.g. Trestle MLS) are Pro/Team only.
    const plan = await getUserPlan(user.id);
    if (plan === "free") {
      return NextResponse.json(
        { error: "MLS integration requires Pro or Team plan.", upgradeUrl: "/pricing" },
        { status: 403 },
      );
    }

    const listingId = searchParams.get("listingId")?.trim();
    if (!listingId) {
      return NextResponse.json({ error: "listingId is required" }, { status: 400 });
    }
    // Basic sanitization — only allow alphanumeric, dashes, underscores
    if (!/^[\w\-]+$/.test(listingId)) {
      return NextResponse.json({ error: "Invalid listingId format" }, { status: 400 });
    }

    // Fetch user's connection
    const { data: conn, error: connErr } = await supabase
      .from("mls_connections")
      .select("client_id_encrypted, client_secret_encrypted, access_token_encrypted, token_expires_at")
      .eq("user_id", user.id)
      .eq("provider", "trestle")
      .eq("status", "active")
      .single();

    if (connErr || !conn) {
      return NextResponse.json(
        { error: "No active MLS connection. Please connect via the dashboard." },
        { status: 403 },
      );
    }

    // Refresh token if expired (or expiring within 5 minutes)
    let accessToken: string;
    const expiresAt = conn.token_expires_at ? new Date(conn.token_expires_at).getTime() : 0;
    if (!conn.access_token_encrypted || Date.now() > expiresAt - 5 * 60 * 1000) {
      accessToken = await refreshToken(
        supabase,
        user.id,
        conn.client_id_encrypted,
        conn.client_secret_encrypted,
      );
    } else {
      accessToken = decrypt(conn.access_token_encrypted);
    }

    // Call Trestle RESO Web API
    const url = `${TRESTLE_API_BASE}/Property?$filter=ListingId eq '${listingId}'&$select=${SELECTED_FIELDS}&$top=1`;

    const trestleRes = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });

    // Audit log (always, regardless of outcome)
    supabase.from("mls_audit_logs").insert({
      user_id:  user.id,
      action:   "lot_data",
      mls_id:   listingId,
      metadata: { provider: "trestle", response_status: trestleRes.status },
      ip_hash:  hashIp(getClientIp(req)),
    }).then(() => {}, (e) => console.error("[MLS audit]", e));

    if (!trestleRes.ok) {
      return NextResponse.json(
        { error: `MLS lookup failed (${trestleRes.status}). Verify listing ID.` },
        { status: 404 },
      );
    }

    const trestleData = await trestleRes.json() as {
      value?: Record<string, unknown>[];
    };

    const listing = trestleData.value?.[0];
    if (!listing) {
      return NextResponse.json(
        { error: `Listing ${listingId} not found in MLS.` },
        { status: 404 },
      );
    }

    // IDX compliance: exclude opted-out listings
    if (listing.InternetEntireListingDisplayYN === false) {
      return NextResponse.json(
        { error: "This listing has opted out of internet display (IDX policy)." },
        { status: 403 },
      );
    }

    // Return display-only data — never persisted in our DB
    return NextResponse.json({
      listingId:       listing.ListingId,
      provider:        provider.id,
      address:         listing.UnparsedAddress,
      lotSizeArea:     listing.LotSizeArea,
      lotSizeUnits:    listing.LotSizeUnits ?? "Square Feet",
      zoning:          listing.Zoning,
      listPrice:       listing.ListPrice,
      status:          listing.StandardStatus,
      propertyType:    listing.PropertyType,
      city:            listing.City,
      state:           listing.StateOrProvince,
      postalCode:      listing.PostalCode,
      mlsProvider:     listing.ListOfficeName ?? "MLS",
      lastUpdated:     listing.ModificationTimestamp,
      // IDX attribution fields
      attribution:     `Listing courtesy of ${listing.ListOfficeName ?? "MLS"} via Trestle`,
      disclaimer:      "For personal, non-commercial use only. Information deemed reliable but not guaranteed.",
      dataTimestamp:   new Date().toISOString(),
    });
  } catch (err) {
    console.error("[MLS lot-data]", err);
    return NextResponse.json({ error: "MLS lookup failed. Please try again." }, { status: 500 });
  }
}
