"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { ExternalLink, Plus, RefreshCw } from "lucide-react";

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

export type GrowthOutreachEvent = {
  id: string;
  lead_id: string;
  contact_id: string | null;
  campaign_id: string | null;
  channel: "linkedin" | "email" | "call" | "webinar";
  type: "connect_request" | "connect_accepted" | "dm" | "comment" | "email_sent" | "email_open" | "email_reply" | "portal_open" | "call" | "follow_up";
  direction: "outbound" | "inbound" | null;
  template_key: string | null;
  sentiment: "pos" | "neutral" | "neg" | null;
  body_excerpt: string | null;
  occurred_at: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export type GrowthProposal = {
  id: string;
  company_id: string | null;
  lead_id: string | null;
  shared_link_id: string | null;
  slug: string | null;
  metro: string | null;
  lot_descriptor: string | null;
  status: "draft" | "sent" | "opened" | "engaged";
  built_at: string;
  first_opened_at: string | null;
  open_count: number;
  last_opened_at: string | null;
  created_at: string;
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

const TOUCH_CHANNELS = ["linkedin", "email", "call", "webinar"] as const;
const TOUCH_TYPES = ["connect_request", "connect_accepted", "dm", "comment", "email_sent", "email_open", "email_reply", "portal_open", "call", "follow_up"] as const;
const TOUCH_SENTIMENTS = ["pos", "neutral", "neg"] as const;

const TOUCH_TYPE_LABELS: Record<GrowthOutreachEvent["type"], string> = {
  connect_request: "Connect request",
  connect_accepted: "Connect accepted",
  dm: "DM",
  comment: "Comment",
  email_sent: "Email sent",
  email_open: "Email open",
  email_reply: "Email reply",
  portal_open: "Portal open",
  call: "Call",
  follow_up: "Follow up",
};

const SENTIMENT_LABELS: Record<NonNullable<GrowthOutreachEvent["sentiment"]>, string> = {
  pos: "Positive",
  neutral: "Neutral",
  neg: "Negative",
};

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
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
  const [selectedLeadId, setSelectedLeadId] = useState(initialLeads[0]?.id ?? "");
  const [eventsByLead, setEventsByLead] = useState<Record<string, GrowthOutreachEvent[]>>({});
  const [proposalsByLead, setProposalsByLead] = useState<Record<string, GrowthProposal[]>>({});
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    loadError ? { ok: false, text: loadError } : null,
  );
  const [savingCompany, setSavingCompany] = useState(false);
  const [savingLead, setSavingLead] = useState(false);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [loadingProposals, setLoadingProposals] = useState(false);
  const [savingEvent, setSavingEvent] = useState(false);
  const [savingProposal, setSavingProposal] = useState(false);
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
  const [touchForm, setTouchForm] = useState<{
    channel: GrowthOutreachEvent["channel"];
    type: GrowthOutreachEvent["type"];
    sentiment: "" | NonNullable<GrowthOutreachEvent["sentiment"]>;
    note: string;
  }>({
    channel: "linkedin",
    type: "dm",
    sentiment: "",
    note: "",
  });
  const [proposalForm, setProposalForm] = useState({
    slug: "",
    metro: "",
    lot_descriptor: "",
  });

  const filteredLeads = useMemo(() => {
    if (stageFilter === "all") return leads;
    return leads.filter((lead) => lead.stage === stageFilter);
  }, [leads, stageFilter]);
  const selectedLead = useMemo(
    () => leads.find((lead) => lead.id === selectedLeadId) ?? filteredLeads[0] ?? leads[0] ?? null,
    [filteredLeads, leads, selectedLeadId],
  );
  const selectedLeadEvents = selectedLead ? eventsByLead[selectedLead.id] ?? [] : [];
  const selectedLeadProposals = selectedLead ? proposalsByLead[selectedLead.id] ?? [] : [];

  useEffect(() => {
    if (!selectedLead?.id || eventsByLead[selectedLead.id]) return;

    let cancelled = false;

    async function loadEvents() {
      if (!selectedLead?.id) return;
      setLoadingEvents(true);
      const response = await fetch(`/api/growth/events?lead_id=${encodeURIComponent(selectedLead.id)}`);
      const data = await response.json() as { events?: GrowthOutreachEvent[]; error?: string };

      if (!cancelled) {
        if (response.ok) {
          setEventsByLead((current) => ({ ...current, [selectedLead.id]: data.events ?? [] }));
        } else {
          setMessage({ ok: false, text: data.error ?? "Failed to load events" });
        }
        setLoadingEvents(false);
      }
    }

    loadEvents();

    return () => {
      cancelled = true;
    };
  }, [eventsByLead, selectedLead]);

  useEffect(() => {
    if (!selectedLead?.id || proposalsByLead[selectedLead.id]) return;

    let cancelled = false;

    async function loadProposals() {
      if (!selectedLead?.id) return;
      setLoadingProposals(true);
      const response = await fetch(`/api/growth/proposals?lead_id=${encodeURIComponent(selectedLead.id)}`);
      const data = await response.json() as { proposals?: GrowthProposal[]; error?: string };

      if (!cancelled) {
        if (response.ok) {
          setProposalsByLead((current) => ({ ...current, [selectedLead.id]: data.proposals ?? [] }));
        } else {
          setMessage({ ok: false, text: data.error ?? "Failed to load proposals" });
        }
        setLoadingProposals(false);
      }
    }

    loadProposals();

    return () => {
      cancelled = true;
    };
  }, [proposalsByLead, selectedLead]);

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
      setSelectedLeadId(data.lead.id);
      setLeadForm((current) => ({ ...current, stage: "to_contact", next_action: "", next_action_date: "" }));
      setMessage({ ok: true, text: "Lead added" });
    } else {
      setMessage({ ok: false, text: data.error ?? "Failed to add lead" });
    }

    setSavingLead(false);
  }

  async function handleCreateEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedLead?.id) return;

    setSavingEvent(true);
    setMessage(null);

    const response = await fetch("/api/growth/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lead_id: selectedLead.id,
        channel: touchForm.channel,
        type: touchForm.type,
        direction: "outbound",
        sentiment: touchForm.sentiment || undefined,
        body_excerpt: touchForm.note,
      }),
    });
    const data = await response.json() as { event?: GrowthOutreachEvent; error?: string };

    if (response.ok && data.event) {
      setEventsByLead((current) => ({
        ...current,
        [selectedLead.id]: [...(current[selectedLead.id] ?? []), data.event!],
      }));
      setTouchForm((current) => ({ ...current, type: "dm", sentiment: "", note: "" }));
      setMessage({ ok: true, text: "Touch added" });
    } else {
      setMessage({ ok: false, text: data.error ?? "Failed to add touch" });
    }

    setSavingEvent(false);
  }

  async function handleLinkProposal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedLead?.id || !proposalForm.slug.trim()) return;

    setSavingProposal(true);
    setMessage(null);

    const response = await fetch("/api/growth/proposals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lead_id: selectedLead.id,
        slug: proposalForm.slug,
        metro: proposalForm.metro,
        lot_descriptor: proposalForm.lot_descriptor,
      }),
    });
    const data = await response.json() as { proposal?: GrowthProposal; error?: string };

    if (response.ok && data.proposal) {
      setProposalsByLead((current) => ({
        ...current,
        [selectedLead.id]: [data.proposal!, ...(current[selectedLead.id] ?? [])],
      }));
      setProposalForm({ slug: "", metro: "", lot_descriptor: "" });
      setMessage({ ok: true, text: "Demo portal linked" });
    } else {
      setMessage({ ok: false, text: data.error ?? "Failed to link demo portal" });
    }

    setSavingProposal(false);
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
          <nav className="flex items-center gap-4 text-sm font-semibold">
            <a href="/dashboard/growth/metrics" className="text-gray-500 hover:text-gray-900">
              Metrics
            </a>
            <a href="/dashboard" className="text-gray-500 hover:text-gray-900">
              Dashboard
            </a>
          </nav>
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
                        <tr key={lead.id} className={lead.id === selectedLead?.id ? "bg-blue-50/50" : "bg-white"}>
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              onClick={() => setSelectedLeadId(lead.id)}
                              className="text-left font-semibold text-gray-900 hover:text-blue-700"
                            >
                              {company?.name ?? "Unknown company"}
                            </button>
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

            <div className="border-t border-gray-100 p-4">
              <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
                <div className="xl:col-span-3">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-[11px] font-bold uppercase tracking-widest text-gray-400">Timeline</h3>
                      <p className="mt-1 text-sm font-semibold text-gray-900">
                        {selectedLead ? leadCompany(selectedLead)?.name ?? "Unknown company" : "No lead selected"}
                      </p>
                    </div>
                    {(loadingEvents || loadingProposals) && <span className="text-xs font-medium text-gray-400">Loading</span>}
                  </div>

                  {selectedLead && (
                    <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-[11px] font-bold uppercase tracking-widest text-gray-400">Demo portals</h3>
                        <span className="text-xs font-medium text-gray-400">{selectedLeadProposals.length} linked</span>
                      </div>

                      {selectedLeadProposals.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-gray-200 bg-white px-3 py-5 text-center text-sm text-gray-400">
                          No demo portal linked.
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {selectedLeadProposals.map((proposal) => (
                            <div key={proposal.id} className="rounded-lg border border-gray-200 bg-white px-3 py-2">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div>
                                  <a
                                    href={proposal.slug ? `/s/${proposal.slug}` : "#"}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 font-mono text-sm font-semibold text-blue-700 hover:text-blue-900"
                                  >
                                    /s/{proposal.slug ?? "-"}
                                    {proposal.slug && <ExternalLink className="h-3.5 w-3.5" />}
                                  </a>
                                  <div className="mt-1 text-xs text-gray-400">
                                    {[proposal.metro, proposal.lot_descriptor].filter(Boolean).join(" · ") || "No lot context"}
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div className="text-sm font-bold text-gray-900">{proposal.open_count} opens</div>
                                  <div className="text-xs text-gray-400">
                                    {proposal.last_opened_at ? formatDateTime(proposal.last_opened_at) : "Not opened"}
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {!selectedLead ? (
                    <div className="rounded-lg border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-400">
                      Select a lead to view touches.
                    </div>
                  ) : selectedLeadEvents.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-400">
                      No touches logged for this lead.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {selectedLeadEvents.map((item) => (
                        <div key={item.id} className="rounded-lg border border-gray-200 bg-white px-3 py-2.5">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-md bg-gray-100 px-2 py-1 text-[11px] font-bold uppercase text-gray-600">
                                {item.channel}
                              </span>
                              <span className="text-sm font-semibold text-gray-900">{TOUCH_TYPE_LABELS[item.type]}</span>
                              {item.sentiment && (
                                <span className="text-xs font-medium text-gray-500">{SENTIMENT_LABELS[item.sentiment]}</span>
                              )}
                            </div>
                            <span className="text-xs text-gray-400">{formatDateTime(item.occurred_at)}</span>
                          </div>
                          {item.body_excerpt && <p className="mt-2 text-sm leading-6 text-gray-700">{item.body_excerpt}</p>}
                          {item.template_key && <p className="mt-1 text-xs text-gray-400">Template: {item.template_key}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="xl:col-span-2 space-y-4">
                <form onSubmit={handleLinkProposal} className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-3">
                  <h3 className="text-[11px] font-bold uppercase tracking-widest text-gray-400">Link demo portal</h3>
                  <input
                    value={proposalForm.slug}
                    onChange={(event) => setProposalForm((current) => ({ ...current, slug: event.target.value }))}
                    placeholder="Slug or /s/slug"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                    required
                  />
                  <input
                    value={proposalForm.metro}
                    onChange={(event) => setProposalForm((current) => ({ ...current, metro: event.target.value }))}
                    placeholder="Metro"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                  />
                  <input
                    value={proposalForm.lot_descriptor}
                    onChange={(event) => setProposalForm((current) => ({ ...current, lot_descriptor: event.target.value }))}
                    placeholder="Lot context"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                  />
                  <button
                    type="submit"
                    disabled={savingProposal || !selectedLead || !proposalForm.slug.trim()}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                  >
                    <Plus className="h-4 w-4" />
                    {savingProposal ? "Linking" : "Link portal"}
                  </button>
                </form>

                <form onSubmit={handleCreateEvent} className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-3">
                  <h3 className="text-[11px] font-bold uppercase tracking-widest text-gray-400">Add touch</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-3">
                    <select
                      value={touchForm.channel}
                      onChange={(event) => setTouchForm((current) => ({ ...current, channel: event.target.value as GrowthOutreachEvent["channel"] }))}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-blue-400 bg-white text-gray-700"
                    >
                      {TOUCH_CHANNELS.map((channel) => (
                        <option key={channel} value={channel}>{channel}</option>
                      ))}
                    </select>
                    <select
                      value={touchForm.type}
                      onChange={(event) => setTouchForm((current) => ({ ...current, type: event.target.value as GrowthOutreachEvent["type"] }))}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-blue-400 bg-white text-gray-700"
                    >
                      {TOUCH_TYPES.map((type) => (
                        <option key={type} value={type}>{TOUCH_TYPE_LABELS[type]}</option>
                      ))}
                    </select>
                    <select
                      value={touchForm.sentiment}
                      onChange={(event) => setTouchForm((current) => ({ ...current, sentiment: event.target.value as typeof current.sentiment }))}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-blue-400 bg-white text-gray-700"
                    >
                      <option value="">Sentiment</option>
                      {TOUCH_SENTIMENTS.map((sentiment) => (
                        <option key={sentiment} value={sentiment}>{SENTIMENT_LABELS[sentiment]}</option>
                      ))}
                    </select>
                  </div>
                  <textarea
                    value={touchForm.note}
                    onChange={(event) => setTouchForm((current) => ({ ...current, note: event.target.value }))}
                    placeholder="Note"
                    rows={4}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                  />
                  <button
                    type="submit"
                    disabled={savingEvent || !selectedLead}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-black disabled:opacity-60"
                  >
                    <Plus className="h-4 w-4" />
                    {savingEvent ? "Adding" : "Add touch"}
                  </button>
                </form>
                </div>
              </div>
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
