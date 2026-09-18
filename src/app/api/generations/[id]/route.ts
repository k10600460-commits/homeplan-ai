import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Read back one of the caller's own generations.
 *
 * /results kept the three concepts in sessionStorage alone. Close the tab, open
 * the link in a second one, or restart the browser and the work was gone — with
 * no error, just a silent redirect to "/". For a free user that silently burned
 * one of their three generations for the month. The rows were in
 * plan_generations the whole time; nothing could read them back. This is that
 * read path.
 *
 * Ownership is enforced by user_id, so a guessed uuid returns 404, not someone
 * else's plans.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data, error } = await admin
    .from("plan_generations")
    .select("id, plans, lot_size, budget, family_size, created_at")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("[generations] read error:", error.message);
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: data.id,
    plans: data.plans,
    // Shape matches what GenerateClient puts in sessionStorage under "formData",
    // so the page can hydrate through the same code path either way.
    formData: {
      lotSize: String(data.lot_size ?? ""),
      budget: String(data.budget ?? ""),
      familySize: String(data.family_size ?? ""),
    },
    createdAt: data.created_at,
  });
}
