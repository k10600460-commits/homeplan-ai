import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import GrowthDashboardClient, { type GrowthCompany, type GrowthLead } from "./GrowthDashboardClient";

const MASTER_USER_ID = "12d6d041-dc0a-4772-8aa7-d71fa2ff43a7";

const COMPANY_SELECT = "id, name, website, domain, metro, state, custom_ratio_note, size_band, builder_type, tier, source, status, notes, created_at, updated_at";
const LEAD_SELECT = `
  id,
  company_id,
  primary_contact_id,
  stage,
  channel,
  owner,
  next_action,
  next_action_date,
  reason_lost,
  created_at,
  updated_at,
  growth_companies(id, name, metro, state, tier, status)
`;

export default async function GrowthDashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");
  if (user.id !== MASTER_USER_ID) notFound();

  const [companiesResult, leadsResult] = await Promise.all([
    supabase
      .from("growth_companies")
      .select(COMPANY_SELECT)
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("growth_leads")
      .select(LEAD_SELECT)
      .order("next_action_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  return (
    <GrowthDashboardClient
      initialCompanies={(companiesResult.data ?? []) as GrowthCompany[]}
      initialLeads={(leadsResult.data ?? []) as GrowthLead[]}
      loadError={companiesResult.error?.message ?? leadsResult.error?.message ?? null}
    />
  );
}
