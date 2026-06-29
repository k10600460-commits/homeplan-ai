"use client";

import { FormEvent, useMemo, useState } from "react";
import { Plus, RefreshCw } from "lucide-react";

export type GrowthCompany = {
  id: string;
  name: string;
  website: string | null;
  domain: string | null;
  metro: string | null;
  state: string | null;
  custom_ratio_note: string | null;
  size_band: "1-49" | "~100" | "100+" | null;
  builder_type: "custom" | "semi-custom" | "spec" | "mixed" | null;
  tier: "A" | "B" | "C" | null;
  source: "apollo" | "manual" | "referral" | "inbound" | "launch-batch" | null;
  status: "new" | "researching" | "active" | "nurture" | "won" | "lost" | "disqualified";
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type LeadCompany = Pick<GrowthCompany, "id" | "name" | "metro" | "state" | "tier" | "status">;

export type GrowthLead = {
  id: string;
  company_id: string;
  primary_contact_id: string | null;
  stage: "to_contact" | "contacted" | "replied" | "demo_scheduled" | "trial" | "won" | "lost";
  channel: "linkedin" | "email" | "referral" | "inbound" | null;
  owner: "shoji" | "va";
  next_action: string | null;
  next_action_date: string | null;
  reason_lost: string | null;
  created_at: string;
  updated_at: string;
  growth_companies: LeadCompany | LeadCompany[] | null;
};

type Props = {
  initialCompanies: GrowthCompany[];
  initialLeads: GrowthLead[];
  loadError: string | null;
};

const STAGES = ["to_contact", "contacted", "replied", "demo_scheduled", "trial", "won", "lost"] as const;
const STAGE_LABELS: Record<GrowthLead["stage"], string> = {
  to_contact: "To contact",
  contacted: "Contacted",
  replied: "Replied",
  demo_scheduled: "Demo scheduled",
  trial: "Trial",
  won: "Won",
  lost: "Lost",
};

const STAGE_STYLES: Record<GrowthLead["stage"], string> = {
  to_contact: "bg-gray-100 text-gray-700 border-gray-200",
  contacted: "bg-blue-50 text-blue-700 border-blue-200",
  replied: "bg-amber-50 text-amber-700 border-amber-200",
  demo_scheduled: "bg-indigo-50 text-indigo-700 border-indigo-200",
  trial: "bg-purple-50 text-purple-700 border-purple-200",
  won: "bg-emerald-50 text-emerald-700 border-emerald-200",
  lost: "bg-slate-100 text-slate-500 border-slate-200",
};

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function leadCompany(lead: GrowthLead): LeadCompany | null {
  if (Array.isArray(lead.growth_companies)) return lead.growth_companies[0] ?? null;
  return lead.growth_companies;
}

export default function GrowthDashboardClient({ initialCompanies, initialLeads, loadError }: Props) {
  const [companies, setCompanies] = useState(initialCompanies);
  const [leads, setLeads] = useState(initialLeads);
  const [stageFilter, setStageFilter] = useState<"all" | GrowthLead["stage"]>("all");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    loadError ? { ok: false, text: loadError } : null,
  );
  const [savingCompany, setSavingCompany] = useState(false);
  const [savingLead, setSavingLead] = useState(false);
  const [companyForm, setCompanyForm] = useState({
    name: "",
    website: "",
    metro: "",
    state: "",
    tier: "",
    status: "new",
  });
  const [leadForm, setLeadForm] = useState({
    company_id: initialCompanies[0]?.id ?? "",
    stage: "to_contact",
    owner: "shoji",
    next_action: "",
    next_action_date: "",
  });

  const filteredLeads = useMemo(() => {
    if (stageFilter === "all") return leads;
    return leads.filter((lead) => lead.stage === stageFilter);
  }, [leads, stageFilter]);

  async function handleCreateCompany(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!companyForm.name.trim()) return;

    setSavingCompany(true);
    setMessage(null);

    const response = await fetch("/api/growth/companies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: companyForm.name,
        website: companyForm.website,
        metro: companyForm.metro,
        state: companyForm.state,
        tier: companyForm.tier || undefined,
        status: companyForm.status,
        source: "manual",
      }),
    });
    const data = await response.json() as { company?: GrowthCompany; error?: string };

    if (response.ok && data.company) {
      setCompanies((current) => [data.company!, ...current]);
      setLeadForm((current) => ({ ...current, company_id: current.company_id || data.company!.id }));
      setCompanyForm({ name: "", website: "", metro: "", state: "", tier: "", status: "new" });
      setMessage({ ok: true, text: "Company added" });
    } else {
      setMessage({ ok: false, text: data.error ?? "Failed to add company" });
    }

    setSavingCompany(false);
  }

  async function handleCreateLead(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!leadForm.company_id) return;

    setSavingLead(true);
    setMessage(null);

    const response = await fetch("/api/growth/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        company_id: leadForm.company_id,
        stage: leadForm.stage,
        owner: leadForm.owner,
        next_action: leadForm.next_action,
        next_action_date: leadForm.next_action_date,
      }),
    });
    const data = await response.json() as { lead?: GrowthLead; error?: string };

    if (response.ok && data.lead) {
      setLeads((current) => [data.lead!, ...current]);
      setLeadForm((current) => ({ ...current, stage: "to_contact", next_action: "", next_action_date: "" }));
      setMessage({ ok: true, text: "Lead added" });
    } else {
      setMessage({ ok: false, text: data.error ?? "Failed to add lead" });
    }

    setSavingLead(false);
  }

  async function refreshLeads() {
    setMessage(null);
    const suffix = stageFilter === "all" ? "" : `?stage=${stageFilter}`;
    const response = await fetch(`/api/growth/leads${suffix}`);
    const data = await response.json() as { leads?: GrowthLead[]; error?: string };
    if (response.ok) {
      setLeads(data.leads ?? []);
      return;
    }
    setMessage({ ok: false, text: data.error ?? "Failed to refresh leads" });
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400">Internal</p>
            <h1 className="text-xl font-bold text-gray-900">Growth CRM</h1>
          </div>
          <a href="/dashboard" className="text-sm font-semibold text-gray-500 hover:text-gray-900">
            Dashboard
          </a>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {message && (
          <div className={`mb-4 rounded-xl border px-4 py-3 text-sm ${message.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"}`}>
            {message.text}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          {[
            { label: "Companies", value: companies.length },
            { label: "Open leads", value: leads.filter((lead) => lead.stage !== "won" && lead.stage !== "lost").length },
            { label: "Won", value: leads.filter((lead) => lead.stage === "won").length },
          ].map((item) => (
            <div key={item.label} className="bg-white rounded-2xl border border-gray-200 shadow-sm px-4 py-3">
              <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400">{item.label}</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">{item.value}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mb-6">
          <section className="lg:col-span-3 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-[11px] font-bold uppercase tracking-widest text-gray-400">Leads</h2>
              <div className="flex items-center gap-2">
                <select
                  value={stageFilter}
                  onChange={(event) => setStageFilter(event.target.value as "all" | GrowthLead["stage"])}
                  className="text-xs rounded-lg border border-gray-200 px-2 py-1.5 focus:outline-none focus:border-blue-400 bg-white text-gray-700"
                >
                  <option value="all">All stages</option>
                  {STAGES.map((stage) => (
                    <option key={stage} value={stage}>{STAGE_LABELS[stage]}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={refreshLeads}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50"
                  title="Refresh leads"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Refresh
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-gray-50 text-left text-[11px] font-bold uppercase tracking-widest text-gray-400">
                  <tr>
                    <th className="px-4 py-3">Company</th>
                    <th className="px-4 py-3">Stage</th>
                    <th className="px-4 py-3">Next action</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Owner</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredLeads.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-gray-400">No leads match this stage.</td>
                    </tr>
                  ) : (
                    filteredLeads.map((lead) => {
                      const company = leadCompany(lead);
                      return (
                        <tr key={lead.id} className="bg-white">
                          <td className="px-4 py-3">
                            <div className="font-semibold text-gray-900">{company?.name ?? "Unknown company"}</div>
                            <div className="text-xs text-gray-400">
                              {[company?.metro, company?.state, company?.tier ? `Tier ${company.tier}` : null].filter(Boolean).join(" · ") || "-"}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex rounded-lg border px-2 py-1 text-xs font-semibold ${STAGE_STYLES[lead.stage]}`}>
                              {STAGE_LABELS[lead.stage]}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-700 max-w-[260px] truncate">{lead.next_action ?? "-"}</td>
                          <td className="px-4 py-3 text-gray-600">{formatDate(lead.next_action_date)}</td>
                          <td className="px-4 py-3 text-gray-600 capitalize">{lead.owner}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <div className="lg:col-span-2 space-y-6">
            <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
              <h2 className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-4">Add company</h2>
              <form onSubmit={handleCreateCompany} className="space-y-3">
                <input
                  value={companyForm.name}
                  onChange={(event) => setCompanyForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Company name"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                  required
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    value={companyForm.website}
                    onChange={(event) => setCompanyForm((current) => ({ ...current, website: event.target.value }))}
                    placeholder="Website"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                  />
                  <input
                    value={companyForm.metro}
                    onChange={(event) => setCompanyForm((current) => ({ ...current, metro: event.target.value }))}
                    placeholder="Metro"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                  />
                  <input
                    value={companyForm.state}
                    onChange={(event) => setCompanyForm((current) => ({ ...current, state: event.target.value }))}
                    placeholder="State"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                  />
                  <select
                    value={companyForm.tier}
                    onChange={(event) => setCompanyForm((current) => ({ ...current, tier: event.target.value }))}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-blue-400 bg-white text-gray-700"
                  >
                    <option value="">Tier</option>
                    <option value="A">A</option>
                    <option value="B">B</option>
                    <option value="C">C</option>
                  </select>
                </div>
                <button
                  type="submit"
                  disabled={savingCompany}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  <Plus className="h-4 w-4" />
                  {savingCompany ? "Adding" : "Add company"}
                </button>
              </form>
            </section>

            <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
              <h2 className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-4">Add lead</h2>
              <form onSubmit={handleCreateLead} className="space-y-3">
                <select
                  value={leadForm.company_id}
                  onChange={(event) => setLeadForm((current) => ({ ...current, company_id: event.target.value }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-blue-400 bg-white text-gray-700"
                  required
                >
                  <option value="">Company</option>
                  {companies.map((company) => (
                    <option key={company.id} value={company.id}>{company.name}</option>
                  ))}
                </select>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <select
                    value={leadForm.stage}
                    onChange={(event) => setLeadForm((current) => ({ ...current, stage: event.target.value }))}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-blue-400 bg-white text-gray-700"
                  >
                    {STAGES.map((stage) => (
                      <option key={stage} value={stage}>{STAGE_LABELS[stage]}</option>
                    ))}
                  </select>
                  <select
                    value={leadForm.owner}
                    onChange={(event) => setLeadForm((current) => ({ ...current, owner: event.target.value }))}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-blue-400 bg-white text-gray-700"
                  >
                    <option value="shoji">Shoji</option>
                    <option value="va">VA</option>
                  </select>
                </div>
                <input
                  value={leadForm.next_action}
                  onChange={(event) => setLeadForm((current) => ({ ...current, next_action: event.target.value }))}
                  placeholder="Next action"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                />
                <input
                  type="date"
                  value={leadForm.next_action_date}
                  onChange={(event) => setLeadForm((current) => ({ ...current, next_action_date: event.target.value }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                />
                <button
                  type="submit"
                  disabled={savingLead || !leadForm.company_id}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  <Plus className="h-4 w-4" />
                  {savingLead ? "Adding" : "Add lead"}
                </button>
              </form>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
