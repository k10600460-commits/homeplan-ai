"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { track } from "@vercel/analytics";

interface User {
  id: string;
  email: string;
}

interface Subscription {
  status: string;
  plan: "free" | "pro" | "team";
  trialEnd: string | null;
  periodEnd: string | null;
  customerId: string | null;
  cancelAtPeriodEnd: boolean;
  isActive: boolean;
}

interface SharedLink {
  id: string;
  slug: string;
  view_count: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  client_name: string | null;
}

interface TeamMember {
  id: string;
  email: string;
  role: string;
  status: string;
  invited_at: string;
  joined_at: string | null;
  planCount: number;
}

interface IntentSignal {
  link_id: string;
  slug: string;
  label: string;
  city: string | null;
  state: string | null;
  views: number;
  plan_selects: number;
  pdf_downloads: number;
  selected_concepts: string[];
  first_seen: string | null;
  last_seen: string | null;
  events_7d: number;
  heat: "HOT" | "WARM" | "COLD";
  next_action: string;
}

interface NurtureDraft {
  id: string;
  link_id: string;
  trigger_type: 'rate_drop' | 'new_concept' | 're_engagement';
  trigger_context: Record<string, unknown>;
  recipient_email: string | null;
  recipient_name: string | null;
  subject: string;
  body: string;
  status: string;
  created_at: string;
  shared_links: { slug: string; client_name: string | null } | null;
}

interface Props {
  user: User;
  subscription: Subscription | null;
  isNewSignup?: boolean;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  trialing: { label: "Free Trial", color: "bg-blue-100 text-blue-700" },
  active:   { label: "Active",     color: "bg-emerald-100 text-emerald-700" },
  past_due: { label: "Past Due",   color: "bg-amber-100 text-amber-700" },
  canceled: { label: "Canceled",   color: "bg-gray-100 text-gray-600" },
  inactive: { label: "No Plan",    color: "bg-gray-100 text-gray-600" },
};

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://homeplan-ai.vercel.app";

// ── MLS connection state ──────────────────────────────────────────────────────
type MlsStatus = "idle" | "connected" | "connecting" | "error";

export default function DashboardClient({ user, subscription, isNewSignup = false }: Props) {
  const router = useRouter();
  const [portalLoading, setPortalLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [signOutLoading, setSignOutLoading] = useState(false);
  const [sharedLinks, setSharedLinks] = useState<SharedLink[]>([]);
  const [newViewAlert, setNewViewAlert] = useState<string | null>(null);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);

  // MLS state
  const [mlsStatus, setMlsStatus] = useState<MlsStatus>("idle");
  const [mlsClientId, setMlsClientId] = useState("");
  const [mlsClientSecret, setMlsClientSecret] = useState("");
  const [mlsAgreed, setMlsAgreed] = useState(false);
  const [mlsError, setMlsError] = useState<string | null>(null);
  const [mlsConnectedAt, setMlsConnectedAt] = useState<string | null>(null);
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);
  const [mlsDisconnecting, setMlsDisconnecting] = useState(false);

  // Team / branding state
  const [userPlan, setUserPlan] = useState<"free" | "pro" | "team">("free");
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [companyName, setCompanyName] = useState("");
  const [companyNameInput, setCompanyNameInput] = useState("");
  const [savingCompany, setSavingCompany] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoMsg, setLogoMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteMsg, setInviteMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [teamCheckoutLoading, setTeamCheckoutLoading] = useState(false);
  const [teamCheckoutError, setTeamCheckoutError] = useState("");

  // Intent signals (buyer activity)
  const [intentSignals, setIntentSignals] = useState<IntentSignal[]>([]);
  const [intentLoading, setIntentLoading] = useState(true);

  // Nurture drafts (Follow-ups)
  const [nurtureDrafts, setNurtureDrafts] = useState<NurtureDraft[]>([]);
  const [nurtureLoading, setNurtureLoading] = useState(true);
  const [nurtureSendingId, setNurtureSendingId] = useState<string | null>(null);
  const [nurtureDismissingId, setNurtureDismissingId] = useState<string | null>(null);
  const [nurtureMsg, setNurtureMsg] = useState<{ id: string; ok: boolean; text: string } | null>(null);

  // Add-concept modal
  const [addConceptSlug, setAddConceptSlug] = useState<string | null>(null);
  const [addConceptForm, setAddConceptForm] = useState({ lotSize: "", budget: "", familySize: "" });
  const [addConceptGenerating, setAddConceptGenerating] = useState(false);
  const [addConceptError, setAddConceptError] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [generatedConcepts, setGeneratedConcepts] = useState<any[] | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [addingConcept, setAddingConcept] = useState<any | null>(null);
  const [addedConceptName, setAddedConceptName] = useState<string | null>(null);

  // Extended branding state
  const [phone, setPhone] = useState("");
  const [phoneInput, setPhoneInput] = useState("");
  const [website, setWebsite] = useState("");
  const [websiteInput, setWebsiteInput] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [licenseInput, setLicenseInput] = useState("");
  const [tagline, setTagline] = useState("");
  const [taglineInput, setTaglineInput] = useState("");
  const [savingContact, setSavingContact] = useState(false);
  const isPro = subscription?.isActive ?? false;

  const supabase = createClient();
  // Ref so the Realtime callback always sees the latest links (avoids stale closure)
  const sharedLinksRef = useRef<SharedLink[]>([]);

  const loadSharedLinks = useCallback(async () => {
    const { data } = await supabase
      .from("shared_links")
      .select("id, slug, view_count, is_active, created_at, updated_at, client_name")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10);
    if (data) {
      setSharedLinks(data as SharedLink[]);
      sharedLinksRef.current = data as SharedLink[];
    }
  }, [supabase, user.id]);

  // Load plan + branding + members
  useEffect(() => {
    fetch("/api/team/plan")
      .then(r => r.json())
      .then((d: { plan: "free" | "pro" | "team"; companyName: string; logoSignedUrl: string | null; phone: string; website: string; licenseNumber: string; tagline: string }) => {
        setUserPlan(d.plan);
        setCompanyName(d.companyName);
        setCompanyNameInput(d.companyName);
        if (d.plan === "team") loadTeamMembers();
        if (d.logoSignedUrl) setLogoPreview(d.logoSignedUrl);
        setPhone(d.phone ?? "");       setPhoneInput(d.phone ?? "");
        setWebsite(d.website ?? "");   setWebsiteInput(d.website ?? "");
        setLicenseNumber(d.licenseNumber ?? ""); setLicenseInput(d.licenseNumber ?? "");
        setTagline(d.tagline ?? "");   setTaglineInput(d.tagline ?? "");
      })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function loadTeamMembers() {
    fetch("/api/team/members")
      .then(r => r.json())
      .then((d: { members: TeamMember[] }) => setTeamMembers(d.members ?? []))
      .catch(() => {});
  }

  async function handleSaveCompanyName() {
    setSavingCompany(true);
    await fetch("/api/team/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyName: companyNameInput }),
    });
    setCompanyName(companyNameInput);
    setSavingCompany(false);
  }

  async function handleSaveContact() {
    setSavingContact(true);
    await fetch("/api/team/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: phoneInput,
        website: websiteInput,
        licenseNumber: licenseInput,
        tagline: taglineInput,
      }),
    });
    setPhone(phoneInput);
    setWebsite(websiteInput);
    setLicenseNumber(licenseInput);
    setTagline(taglineInput);
    setSavingContact(false);
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoMsg(null);
    setLogoUploading(true);
    const form = new FormData();
    form.append("logo", file);
    const res = await fetch("/api/branding/logo", { method: "POST", body: form });
    const data = await res.json() as { signedUrl?: string; error?: string };
    if (res.ok && data.signedUrl) {
      setLogoPreview(data.signedUrl);
      setLogoMsg({ ok: true, text: "Logo uploaded" });
    } else {
      setLogoMsg({ ok: false, text: data.error ?? "Upload failed" });
    }
    setLogoUploading(false);
    e.target.value = "";
  }

  async function handleLogoDelete() {
    setLogoUploading(true);
    await fetch("/api/branding/logo", { method: "DELETE" });
    setLogoPreview(null);
    setLogoMsg({ ok: true, text: "Logo removed" });
    setLogoUploading(false);
  }

  async function handleInvite() {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    setInviteMsg(null);
    const res = await fetch("/api/team/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: inviteEmail }),
    });
    const data = await res.json() as { success?: boolean; error?: string };
    setInviteMsg(data.success
      ? { ok: true, text: `Invitation sent to ${inviteEmail}` }
      : { ok: false, text: data.error ?? "Failed to send invitation" }
    );
    if (data.success) { setInviteEmail(""); loadTeamMembers(); }
    setInviting(false);
  }

  async function handleRemoveMember(memberId: string) {
    await fetch("/api/team/members", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberId }),
    });
    loadTeamMembers();
  }

  async function handleTeamCheckout() {
    setTeamCheckoutLoading(true);
    setTeamCheckoutError("");
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: "team" }),
      });
      const data = await res.json() as { url?: string; error?: string };
      if (data.url) {
        window.location.href = data.url;
      } else {
        setTeamCheckoutError(data.error ?? "Failed to start checkout. Please try again.");
        setTeamCheckoutLoading(false);
      }
    } catch {
      setTeamCheckoutError("Network error. Please try again.");
      setTeamCheckoutLoading(false);
    }
  }

  useEffect(() => {
    fetch("/api/intent-signals")
      .then(r => r.json())
      .then((d: { signals?: IntentSignal[] }) => {
        setIntentSignals(d.signals ?? []);
        setIntentLoading(false);
      })
      .catch(() => setIntentLoading(false));
  }, []);

  useEffect(() => {
    fetch("/api/nurture/drafts")
      .then(r => r.json())
      .then((d: { drafts?: NurtureDraft[] }) => {
        setNurtureDrafts(d.drafts ?? []);
        setNurtureLoading(false);
      })
      .catch(() => setNurtureLoading(false));
  }, []);

  async function handleNurtureSend(draftId: string) {
    setNurtureSendingId(draftId);
    setNurtureMsg(null);
    try {
      const res = await fetch(`/api/nurture/${draftId}/send`, { method: "POST" });
      if (res.ok) {
        setNurtureDrafts(prev => prev.filter(d => d.id !== draftId));
        setNurtureMsg({ id: draftId, ok: true, text: "Email sent." });
      } else {
        const body = await res.json() as { error?: string };
        setNurtureMsg({ id: draftId, ok: false, text: body.error ?? "Send failed." });
      }
    } catch {
      setNurtureMsg({ id: draftId, ok: false, text: "Network error." });
    } finally {
      setNurtureSendingId(null);
    }
  }

  async function handleNurtureDismiss(draftId: string) {
    setNurtureDismissingId(draftId);
    try {
      const res = await fetch(`/api/nurture/${draftId}/dismiss`, { method: "POST" });
      if (res.ok) setNurtureDrafts(prev => prev.filter(d => d.id !== draftId));
    } catch { /* ignore */ }
    finally { setNurtureDismissingId(null); }
  }

  // Check MLS connection status on mount
  useEffect(() => {
    fetch("/api/mls/status")
      .then(r => r.json())
      .then((d: { connected: boolean; connectedAt?: string }) => {
        if (d.connected) {
          setMlsStatus("connected");
          setMlsConnectedAt(d.connectedAt ?? null);
        }
      })
      .catch(() => {});
  }, []);

  async function handleMlsConnect() {
    setMlsError(null);
    setMlsStatus("connecting");
    try {
      const res = await fetch("/api/mls/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: mlsClientId,
          clientSecret: mlsClientSecret,
          agreedToTerms: mlsAgreed,
        }),
      });
      const data = await res.json() as { success?: boolean; error?: string; expiresAt?: string };
      if (!res.ok) throw new Error(data.error ?? "Connection failed");
      setMlsStatus("connected");
      setMlsConnectedAt(new Date().toISOString());
      setMlsClientId("");
      setMlsClientSecret("");
    } catch (err) {
      setMlsStatus("error");
      setMlsError(err instanceof Error ? err.message : "Connection failed");
    }
  }

  async function handleMlsDisconnect() {
    setShowDisconnectConfirm(false);
    setMlsDisconnecting(true);
    try {
      await fetch("/api/mls/disconnect", { method: "POST" });
      setMlsStatus("idle");
      setMlsConnectedAt(null);
    } catch {
      // revert — keep connected
    } finally {
      setMlsDisconnecting(false);
    }
  }

  useEffect(() => {
    loadSharedLinks();

    // Supabase Realtime: link_events INSERT — RLS ensures we only get events for own links
    const channel = supabase
      .channel("link_events_realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "link_events" },
        async (payload) => {
          const newEvent = payload.new as { link_id: string; event_type: string };
          // Use ref (not state) to avoid stale closure
          const link = sharedLinksRef.current.find((l) => l.id === newEvent.link_id);
          if (link) {
            await loadSharedLinks();
            if (newEvent.event_type === "view") {
              setNewViewAlert(link.slug);
              setTimeout(() => setNewViewAlert(null), 5000);
            }
          }
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  // loadSharedLinks is stable (useCallback with stable deps); supabase client is stable
  }, [loadSharedLinks, supabase]);

  async function handleCopyLink(slug: string) {
    await navigator.clipboard.writeText(`${APP_URL}/s/${slug}`);
    setCopiedSlug(slug);
    setTimeout(() => setCopiedSlug(null), 2000);
  }

  function openAddConcept(slug: string) {
    setAddConceptSlug(slug);
    setAddConceptForm({ lotSize: "", budget: "", familySize: "" });
    setAddConceptError(null);
    setGeneratedConcepts(null);
    setAddingConcept(null);
    setAddedConceptName(null);
  }

  function closeAddConcept() {
    setAddConceptSlug(null);
    setGeneratedConcepts(null);
    setAddedConceptName(null);
  }

  async function handleGenerateConcepts() {
    const lotSizeNum  = parseInt(addConceptForm.lotSize.replace(/,/g, ""), 10);
    const budgetNum   = parseInt(addConceptForm.budget.replace(/[$,]/g, ""), 10);
    const familyNum   = parseInt(addConceptForm.familySize, 10);
    if (!lotSizeNum || !budgetNum || !familyNum) {
      setAddConceptError("Please fill in all three fields.");
      return;
    }
    setAddConceptGenerating(true);
    setAddConceptError(null);
    setGeneratedConcepts(null);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lotSize: lotSizeNum, budget: budgetNum, familySize: familyNum }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setAddConceptError(d.error ?? "Generation failed. Please try again.");
        return;
      }
      const data = await res.json();
      setGeneratedConcepts(data.plans ?? []);
    } catch {
      setAddConceptError("Network error. Please try again.");
    } finally {
      setAddConceptGenerating(false);
    }
  }

  async function handleAddConcept(plan: unknown) {
    if (!addConceptSlug) return;
    setAddingConcept(plan);
    try {
      const res = await fetch(`/api/portal/${addConceptSlug}/add-concept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      if (!res.ok) {
        setAddConceptError("Failed to add concept. Please try again.");
        return;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setAddedConceptName((plan as any)?.name ?? "Concept");
      setGeneratedConcepts(null);
      await loadSharedLinks();
    } finally {
      setAddingConcept(null);
    }
  }

  function timeAgo(iso: string) {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  async function handleSignOut() {
    setSignOutLoading(true);
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  async function handleManageBilling() {
    if (!subscription?.customerId) return;
    setPortalLoading(true);
    const res = await fetch("/api/stripe/portal", {
      method: "POST",
    });
    const data = await res.json();
    if (data.url) window.location.href = data.url;
    else setPortalLoading(false);
  }

  async function handleSubscribe() {
    setCheckoutLoading(true);
    try {
      const res = await fetch("/api/stripe/checkout", { method: "POST" });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else setCheckoutLoading(false);
    } catch {
      setCheckoutLoading(false);
    }
  }

  // Auto-fire checkout for new signups arriving via /dashboard?new_signup=1.
  // ref guard prevents double-fire under React StrictMode (effect runs twice in dev).
  const autoSubscribeFiredRef = useRef(false);
  useEffect(() => {
    if (!isNewSignup || autoSubscribeFiredRef.current) return;
    autoSubscribeFiredRef.current = true;
    track("signup");
    window.history.replaceState({}, "", "/dashboard");
    handleSubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const statusInfo = STATUS_LABELS[subscription?.status ?? "inactive"] ?? STATUS_LABELS.inactive;

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Add Concept Modal */}
      {addConceptSlug !== null && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 px-0 sm:px-4"
          onClick={closeAddConcept}
        >
          <div
            className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl p-6 sm:p-8 max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Add a Concept</h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  Generate a new floor-plan and add it to <span className="font-mono text-gray-700">/s/{addConceptSlug}</span>
                </p>
              </div>
              <button onClick={closeAddConcept} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {addedConceptName ? (
              <div className="text-center py-8">
                <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
                  <svg className="w-7 h-7 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-lg font-bold text-gray-900">&ldquo;{addedConceptName}&rdquo; added!</p>
                <p className="text-sm text-gray-500 mt-1">The buyer will see it with a New badge on their next visit.</p>
                <button onClick={closeAddConcept} className="mt-6 px-6 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors">
                  Done
                </button>
              </div>
            ) : generatedConcepts ? (
              <div className="space-y-3">
                <p className="text-sm font-semibold text-gray-700 mb-1">Pick one to add to the portal:</p>
                {addConceptError && <p className="text-sm text-red-500">{addConceptError}</p>}
                {generatedConcepts.map((p, idx) => (
                  <div key={idx} className="flex items-start justify-between gap-3 px-4 py-3 rounded-xl border border-gray-200 bg-gray-50">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-gray-900">{p.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {p.style} · {p.squareFootage?.toLocaleString()} sqft · {p.bedrooms}bd / {p.bathrooms}ba · ${(p.estimatedCost / 1000).toFixed(0)}K
                      </p>
                    </div>
                    <button
                      onClick={() => handleAddConcept(p)}
                      disabled={addingConcept !== null}
                      className="shrink-0 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 disabled:opacity-60 transition-colors"
                    >
                      {addingConcept === p ? "Adding…" : "Add this"}
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => { setGeneratedConcepts(null); setAddConceptError(null); }}
                  className="w-full py-2 text-xs text-gray-400 hover:text-gray-600 transition-colors"
                >
                  ← Back to form
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">Lot Size (sq ft)</label>
                  <input
                    type="text"
                    placeholder="e.g. 8000"
                    value={addConceptForm.lotSize}
                    onChange={e => setAddConceptForm(f => ({ ...f, lotSize: e.target.value }))}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">Total Budget ($)</label>
                  <input
                    type="text"
                    placeholder="e.g. 450000"
                    value={addConceptForm.budget}
                    onChange={e => setAddConceptForm(f => ({ ...f, budget: e.target.value }))}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">Family Size</label>
                  <input
                    type="text"
                    placeholder="e.g. 4"
                    value={addConceptForm.familySize}
                    onChange={e => setAddConceptForm(f => ({ ...f, familySize: e.target.value }))}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                {addConceptError && <p className="text-sm text-red-500">{addConceptError}</p>}
                <button
                  onClick={handleGenerateConcepts}
                  disabled={addConceptGenerating}
                  className="w-full py-3 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
                >
                  {addConceptGenerating ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      Generating…
                    </>
                  ) : "Generate 3 options →"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Nav */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <a href="/" className="text-xl font-bold tracking-tight text-gray-900">
            Splan<span className="text-blue-600">AI</span>
          </a>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500 hidden sm:block">{user.email}</span>
            <button
              onClick={handleSignOut}
              disabled={signOutLoading}
              className="text-sm text-gray-600 hover:text-gray-900 transition-colors disabled:opacity-50"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-extrabold text-gray-900 mb-8">Dashboard</h1>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Subscription card */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4">
              Subscription
            </h2>

            <div className="flex items-center gap-3 mb-4">
              <span className={`px-3 py-1 rounded-full text-sm font-semibold ${statusInfo.color}`}>
                {statusInfo.label}
              </span>
              {subscription?.isActive && (
                <span className="text-sm text-gray-500">
                  {subscription.plan === "team" ? "$149/month" : "$49/month"}
                </span>
              )}
            </div>

            {/* Cancel-at-period-end banner */}
            {subscription?.cancelAtPeriodEnd && subscription.periodEnd && (
              <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 mb-4">
                <svg className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm text-amber-800">
                  Your plan is active until <span className="font-semibold">{formatDate(subscription.periodEnd)}</span>. Enjoy SplanAI until then!
                </p>
              </div>
            )}

            {subscription ? (
              <div className="space-y-2 text-sm text-gray-600 mb-6">
                {subscription.status === "trialing" && subscription.trialEnd && (
                  <p>Trial ends: <span className="font-medium text-gray-900">{formatDate(subscription.trialEnd)}</span></p>
                )}
                {subscription.status === "active" && subscription.periodEnd && !subscription.cancelAtPeriodEnd && (
                  <p>Next billing: <span className="font-medium text-gray-900">{formatDate(subscription.periodEnd)}</span></p>
                )}
                {subscription.status === "past_due" && (
                  <p className="text-amber-700">Your payment failed. Please update your billing info.</p>
                )}
                {subscription.status === "canceled" && (
                  <p>Your subscription has been canceled.</p>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-500 mb-6">
                No active subscription. Start your 14-day free trial.
              </p>
            )}

            {subscription?.isActive && subscription.customerId ? (
              <button
                onClick={handleManageBilling}
                disabled={portalLoading}
                className="w-full py-2.5 rounded-xl border-2 border-gray-200 text-gray-700 text-sm font-semibold hover:border-gray-300 hover:bg-gray-50 transition-all disabled:opacity-50"
              >
                {portalLoading ? "Loading…" : "Manage Billing & Cancel"}
              </button>
            ) : (
              <button
                onClick={handleSubscribe}
                disabled={checkoutLoading}
                className="w-full py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {checkoutLoading ? "Loading…" : "Start Free Trial →"}
              </button>
            )}
          </div>

          {/* Generate card */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 flex flex-col">
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4">
              Floor Plan Generator
            </h2>

            <p className="text-sm text-gray-600 mb-6 flex-1">
              Enter your lot details and get 3 AI-generated floor plan proposals in seconds. Export as branded PDF.
            </p>

            <a
              href="/generate"
              className="w-full py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors text-center block"
            >
              Generate Plans →
            </a>
            {!subscription?.isActive && (
              <p className="text-xs text-center text-gray-400 mt-2">
                Free plan: up to 3 generations/month
              </p>
            )}
          </div>
        </div>

        {/* Account info */}
        <div className="mt-6 bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4">
            Account
          </h2>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">{user.email}</p>
              <p className="text-xs text-gray-400 mt-0.5">User ID: {user.id.slice(0, 8)}…</p>
            </div>
          </div>
        </div>

        {/* Connect Data Sources */}
        <div className="mt-6 bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-5">
            Connect Data Sources
          </h2>
          <div className="space-y-3">

            {/* ── MLS via Trestle (top / most important) ── */}
            <div className={`rounded-xl border-2 p-4 ${mlsStatus === "connected" ? "bg-emerald-50 border-emerald-200" : "bg-white border-gray-200"}`}>
              <div className="flex items-center justify-between gap-4 mb-3">
                <div className="flex items-center gap-3">
                  <span className="text-xl">🏠</span>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-gray-800">MLS via Trestle</p>
                      {!isPro && (
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">Pro</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500">Real lot data from 500+ MLS boards nationwide</p>
                  </div>
                </div>
                {mlsStatus === "connected" && (
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 shrink-0">✓ Connected</span>
                )}
              </div>

              {/* Connected state */}
              {mlsStatus === "connected" && (
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-emerald-700">
                    MLS data active · {mlsConnectedAt ? `Connected ${formatDate(mlsConnectedAt)}` : ""}
                  </p>
                  {!showDisconnectConfirm ? (
                    <button
                      onClick={() => setShowDisconnectConfirm(true)}
                      className="text-xs text-red-500 hover:text-red-700 font-semibold underline transition-colors"
                    >
                      Disconnect
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">Are you sure?</span>
                      <button
                        onClick={handleMlsDisconnect}
                        disabled={mlsDisconnecting}
                        className="text-xs font-bold text-white bg-red-500 hover:bg-red-600 px-3 py-1 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {mlsDisconnecting ? "Disconnecting…" : "Yes, disconnect"}
                      </button>
                      <button
                        onClick={() => setShowDisconnectConfirm(false)}
                        className="text-xs text-gray-500 hover:text-gray-700"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Not connected — Pro only */}
              {mlsStatus !== "connected" && isPro && (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-gray-500 block mb-1">Trestle Client ID</label>
                      <input
                        type="text"
                        value={mlsClientId}
                        onChange={e => setMlsClientId(e.target.value)}
                        placeholder="e.g. your-client-id"
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-800 placeholder-gray-300 focus:outline-none focus:border-blue-400 transition"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500 block mb-1">Trestle Client Secret</label>
                      <input
                        type="password"
                        value={mlsClientSecret}
                        onChange={e => setMlsClientSecret(e.target.value)}
                        placeholder="••••••••"
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-800 placeholder-gray-300 focus:outline-none focus:border-blue-400 transition"
                      />
                    </div>
                  </div>
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={mlsAgreed}
                      onChange={e => setMlsAgreed(e.target.checked)}
                      className="mt-0.5 accent-blue-600 shrink-0"
                    />
                    <span className="text-xs text-gray-500 leading-relaxed">
                      I agree to use MLS data in compliance with IDX policy. Data is for display purposes only and may not be stored or redistributed. I confirm I hold a valid MLS license.
                    </span>
                  </label>
                  {mlsError && (
                    <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100">{mlsError}</p>
                  )}
                  <div className="flex items-center justify-between gap-3">
                    <a
                      href="https://trestle.corelogic.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:underline"
                    >
                      How to get Trestle API credentials →
                    </a>
                    <button
                      onClick={handleMlsConnect}
                      disabled={!mlsClientId || !mlsClientSecret || !mlsAgreed || mlsStatus === "connecting"}
                      className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {mlsStatus === "connecting" ? "Connecting…" : "Connect MLS via Trestle"}
                    </button>
                  </div>
                  <p className="text-xs text-gray-400">NAR IDX compliant · All API calls logged · Revoke anytime</p>
                </div>
              )}

              {/* Not connected — Free plan lock */}
              {mlsStatus !== "connected" && !isPro && (
                <div className="flex items-center justify-between gap-3 pt-1">
                  <p className="text-xs text-gray-400">Upgrade to Pro to connect your MLS license.</p>
                  <button
                    onClick={handleSubscribe}
                    disabled={checkoutLoading}
                    className="text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                  >
                    Upgrade to Pro →
                  </button>
                </div>
              )}
            </div>

            {/* Google Maps — connected */}
            <div className="flex items-center justify-between gap-4 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-100">
              <div className="flex items-center gap-3">
                <span className="text-lg">🗺️</span>
                <div>
                  <p className="text-sm font-semibold text-gray-800">Google Maps</p>
                  <p className="text-xs text-gray-500">Places & geocoding</p>
                </div>
              </div>
              <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700">✓ Connected</span>
            </div>
            {/* RentCast — connected */}
            <div className="flex items-center justify-between gap-4 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-100">
              <div className="flex items-center gap-3">
                <span className="text-lg">📊</span>
                <div>
                  <p className="text-sm font-semibold text-gray-800">RentCast</p>
                  <p className="text-xs text-gray-500">Market rent & sale price data</p>
                </div>
              </div>
              <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700">✓ Connected</span>
            </div>
            {/* Zoning Data — coming soon */}
            <div className="flex items-center justify-between gap-4 px-4 py-3 rounded-xl bg-gray-50 border border-dashed border-gray-200">
              <div className="flex items-center gap-3">
                <span className="text-lg opacity-50">🏛️</span>
                <div>
                  <p className="text-sm font-semibold text-gray-500">Zoning Data</p>
                  <p className="text-xs text-gray-400">Powered by Zoneomics</p>
                </div>
              </div>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-gray-100 text-gray-400">Coming soon</span>
            </div>
          </div>
        </div>

        {/* ── Branding Settings (Pro + Team) ── */}
        {(userPlan === "pro" || userPlan === "team") && (
          <div className="mt-6 bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
            <div className="flex items-center gap-2 mb-5">
              <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400">Builder Profile</h2>
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-semibold">
                PDF + Portal
              </span>
            </div>

            {/* Company Name */}
            <div className="mb-5">
              <label className="text-xs font-semibold text-gray-500 block mb-1.5">
                Company Name
                <span className="text-gray-300 ml-1">(PDF header + client portal)</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={companyNameInput}
                  onChange={e => setCompanyNameInput(e.target.value)}
                  placeholder="e.g. Johnson Home Builders"
                  maxLength={100}
                  className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-800 placeholder-gray-300 focus:outline-none focus:border-blue-400 transition"
                />
                <button
                  onClick={handleSaveCompanyName}
                  disabled={savingCompany || companyNameInput === companyName}
                  className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 transition-colors disabled:opacity-40"
                >
                  {savingCompany ? "Saving…" : "Save"}
                </button>
              </div>
              {companyName && (
                <p className="text-xs text-emerald-600 mt-1">
                  ✓ Set — PDFs and client portal will show &ldquo;{companyName}&rdquo;
                </p>
              )}
            </div>

            {/* Logo Upload */}
            <div>
              <label className="text-xs font-semibold text-gray-500 block mb-1.5">
                Company Logo
                <span className="text-gray-300 ml-1">(PDF + portal header · PNG/JPEG/WebP/SVG · max 512 KB)</span>
              </label>
              {logoPreview ? (
                <div className="flex items-center gap-4 p-3 rounded-xl border border-gray-200 bg-gray-50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={logoPreview} alt="Your logo" className="h-10 object-contain max-w-[140px] rounded" />
                  <div className="flex-1">
                    <p className="text-xs text-emerald-600 font-semibold">Logo active</p>
                    <p className="text-xs text-gray-400">Shown in PDF + client portal header</p>
                  </div>
                  <button
                    onClick={handleLogoDelete}
                    disabled={logoUploading}
                    className="text-xs text-red-400 hover:text-red-600 transition-colors disabled:opacity-40"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <label className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-dashed border-gray-200 hover:border-blue-400 transition-colors cursor-pointer ${logoUploading ? "opacity-50 pointer-events-none" : ""}`}>
                  <svg className="w-5 h-5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span className="text-sm text-gray-500">
                    {logoUploading ? "Uploading…" : "Click to upload logo"}
                  </span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    className="hidden"
                    onChange={handleLogoUpload}
                    disabled={logoUploading}
                  />
                </label>
              )}
              {logoMsg && (
                <p className={`text-xs mt-1.5 ${logoMsg.ok ? "text-emerald-600" : "text-red-500"}`}>{logoMsg.text}</p>
              )}
            </div>

            {/* Contact & Identity */}
            <div className="mt-5 pt-5 border-t border-gray-100">
              <p className="text-xs font-semibold text-gray-500 mb-3">Contact &amp; Identity <span className="text-gray-300 font-normal">(shown in portal footer + PDF)</span></p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Phone</label>
                  <input
                    type="text"
                    value={phoneInput}
                    onChange={e => setPhoneInput(e.target.value)}
                    placeholder="e.g. (615) 555-0100"
                    maxLength={30}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-800 placeholder-gray-300 focus:outline-none focus:border-blue-400 transition"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Website</label>
                  <input
                    type="text"
                    value={websiteInput}
                    onChange={e => setWebsiteInput(e.target.value)}
                    placeholder="e.g. johnsonhomes.com"
                    maxLength={200}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-800 placeholder-gray-300 focus:outline-none focus:border-blue-400 transition"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">License #</label>
                  <input
                    type="text"
                    value={licenseInput}
                    onChange={e => setLicenseInput(e.target.value)}
                    placeholder="e.g. TN-BC-123456"
                    maxLength={60}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-800 placeholder-gray-300 focus:outline-none focus:border-blue-400 transition"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Tagline</label>
                  <input
                    type="text"
                    value={taglineInput}
                    onChange={e => setTaglineInput(e.target.value)}
                    placeholder="e.g. Building Nashville since 2003"
                    maxLength={120}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-800 placeholder-gray-300 focus:outline-none focus:border-blue-400 transition"
                  />
                </div>
              </div>
              <button
                onClick={handleSaveContact}
                disabled={savingContact || (phoneInput === phone && websiteInput === website && licenseInput === licenseNumber && taglineInput === tagline)}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 transition-colors disabled:opacity-40"
              >
                {savingContact ? "Saving…" : "Save Contact Info"}
              </button>
            </div>
          </div>
        )}

        {/* ── Team Panel ── */}
        {userPlan === "team" && (
          <div className="mt-6 bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-5">Team Management</h2>

            {/* Invite Member */}
            <div className="mb-5">
              <label className="text-xs font-semibold text-gray-500 block mb-1.5">
                Invite Member <span className="text-gray-300">({teamMembers.filter(m => m.status !== "removed").length}/{14} slots used)</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={e => { setInviteEmail(e.target.value); setInviteMsg(null); }}
                  placeholder="colleague@company.com"
                  className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-800 placeholder-gray-300 focus:outline-none focus:border-blue-400 transition"
                />
                <button
                  onClick={handleInvite}
                  disabled={!inviteEmail.trim() || inviting}
                  className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition-colors disabled:opacity-40"
                >
                  {inviting ? "Sending…" : "Send Invite"}
                </button>
              </div>
              {inviteMsg && (
                <p className={`text-xs mt-1.5 ${inviteMsg.ok ? "text-emerald-600" : "text-red-500"}`}>{inviteMsg.text}</p>
              )}
            </div>

            {/* Members List */}
            {teamMembers.length > 0 && (
              <div className="space-y-2">
                {teamMembers.map(m => (
                  <div key={m.id} className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-100">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-gray-800 truncate">{m.email}</p>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                          m.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                        }`}>
                          {m.status === "active" ? "Active" : "Invited"}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {m.status === "active" ? `${m.planCount} plans this month` : `Invited ${timeAgo(m.invited_at)}`}
                      </p>
                    </div>
                    <button
                      onClick={() => handleRemoveMember(m.id)}
                      className="text-xs text-red-400 hover:text-red-600 shrink-0 transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
            {teamMembers.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-3">No members yet. Invite your team above.</p>
            )}
          </div>
        )}

        {/* Upgrade to Pro CTA (for Free users) */}
        {userPlan === "free" && (
          <div className="mt-6 bg-white rounded-2xl border border-blue-200 shadow-sm p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h2 className="text-sm font-bold text-gray-800">Upgrade to Pro</h2>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-blue-600 text-white font-semibold">Most popular</span>
                </div>
                <p className="text-xs text-gray-500">100 floor plans/month · Branded PDF · MLS access · $49/mo</p>
              </div>
              <button
                onClick={handleSubscribe}
                disabled={checkoutLoading}
                className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 transition-colors disabled:opacity-50 shrink-0"
              >
                {checkoutLoading ? "Loading…" : "Start Free Trial →"}
              </button>
            </div>
          </div>
        )}

        {/* Upgrade to Team CTA (for Pro users) */}
        {userPlan === "pro" && (
          <div className="mt-6 bg-white rounded-2xl border border-emerald-200 shadow-sm p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-sm font-bold text-gray-800">Need team access?</h2>
                <p className="text-xs text-gray-500 mt-0.5">5–15 users · White-label PDF · Team dashboard · $149/mo</p>
              </div>
              <button
                onClick={handleTeamCheckout}
                disabled={teamCheckoutLoading}
                className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 transition-colors disabled:opacity-50 shrink-0"
              >
                {teamCheckoutLoading ? "Redirecting…" : "Upgrade to Team →"}
              </button>
            </div>
            {teamCheckoutError && (
              <p className="mt-2 text-xs text-red-600">{teamCheckoutError}</p>
            )}
          </div>
        )}

        {/* Shared Links panel */}
        <div className="mt-6 bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400">
              Client Activity
            </h2>
            {sharedLinks.length > 0 && (
              <div className="flex items-center gap-3 text-xs text-gray-400">
                <span>{sharedLinks.length} link{sharedLinks.length !== 1 ? "s" : ""}</span>
                <span className="font-semibold text-blue-600">
                  {sharedLinks.reduce((s, l) => s + l.view_count, 0)} total views
                </span>
              </div>
            )}
          </div>

          {/* New view alert */}
          {newViewAlert && (
            <div className="mb-4 flex items-center gap-3 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm animate-pulse">
              <svg className="w-4 h-4 shrink-0 text-emerald-500" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
              </svg>
              あなたのリンクが閲覧されました — <span className="font-mono font-medium">/s/{newViewAlert}</span>
            </div>
          )}

          {sharedLinks.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">
              No shared links yet. Generate plans and share them with clients!
            </p>
          ) : (
            <div className="space-y-3">
              {sharedLinks.map((link) => (
                <div
                  key={link.id}
                  className="flex items-center justify-between gap-4 px-4 py-3 rounded-xl bg-gray-50 border border-gray-100"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-mono text-gray-700 font-medium">/s/{link.slug}</span>
                      {link.client_name && (
                        <span className="text-xs text-gray-400">· {link.client_name}</span>
                      )}
                      {!link.is_active && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-gray-200 text-gray-500">inactive</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="flex items-center gap-1 text-xs text-gray-500">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.522 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.478 0-8.268-2.943-9.542-7z" />
                        </svg>
                        {link.view_count} view{link.view_count !== 1 ? "s" : ""}
                      </span>
                      <span className="text-xs text-gray-400">
                        {link.view_count > 0 ? `Last: ${timeAgo(link.updated_at)}` : `Created ${timeAgo(link.created_at)}`}
                      </span>
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center gap-2">
                    <button
                      onClick={() => openAddConcept(link.slug)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-200 text-xs font-medium text-indigo-600 hover:bg-indigo-50 transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Add concept
                    </button>
                    <button
                      onClick={() => handleCopyLink(link.slug)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:border-blue-400 hover:text-blue-600 transition-colors"
                    >
                      {copiedSlug === link.slug ? (
                        <>
                          <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          Copied!
                        </>
                      ) : (
                        <>
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                          </svg>
                          Copy Link
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Buyer Activity / Hot Leads */}
        <div className="mt-6 bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400">
              Buyer Activity
            </h2>
            {!intentLoading && intentSignals.length > 0 && (
              <span className="text-xs text-gray-400">
                {intentSignals.filter(s => s.heat === "HOT").length} hot
                {" · "}
                {intentSignals.filter(s => s.heat === "WARM").length} warm
              </span>
            )}
          </div>

          {intentLoading ? (
            <p className="text-sm text-gray-400 text-center py-4">Loading…</p>
          ) : intentSignals.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">
              No buyer activity yet. Share proposals to start tracking engagement.
            </p>
          ) : (
            <div className="space-y-3">
              {intentSignals
                .filter(s => s.heat !== "COLD")
                .slice(0, 10)
                .map(s => {
                  const heatCfg = {
                    HOT:  { bg: "bg-red-50",    border: "border-red-200",    badge: "bg-red-100 text-red-700",     dot: "bg-red-500"   },
                    WARM: { bg: "bg-amber-50",  border: "border-amber-200",  badge: "bg-amber-100 text-amber-700", dot: "bg-amber-400" },
                    COLD: { bg: "bg-gray-50",   border: "border-gray-100",   badge: "bg-gray-100 text-gray-500",   dot: "bg-gray-300"  },
                  }[s.heat];
                  return (
                    <div key={s.link_id} className={`px-4 py-3 rounded-xl border ${heatCfg.bg} ${heatCfg.border}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold ${heatCfg.badge}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${heatCfg.dot}`} />
                              {s.heat}
                            </span>
                            <span className="text-sm font-semibold text-gray-900 truncate">{s.label}</span>
                            {(s.city || s.state) && (
                              <span className="text-xs text-gray-400 shrink-0">{[s.city, s.state].filter(Boolean).join(", ")}</span>
                            )}
                          </div>
                          <p className="text-xs font-medium text-blue-700">{s.next_action}</p>
                          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                            {s.views > 0 && (
                              <span className="text-xs text-gray-500">{s.views} view{s.views !== 1 ? "s" : ""}</span>
                            )}
                            {s.plan_selects > 0 && (
                              <span className="text-xs text-emerald-600 font-semibold">✓ {s.plan_selects} plan selected</span>
                            )}
                            {s.pdf_downloads > 0 && (
                              <span className="text-xs text-purple-600 font-semibold">↓ PDF</span>
                            )}
                            <span className="text-xs text-gray-400 ml-auto shrink-0">
                              {s.last_seen ? timeAgo(s.last_seen) : ""}
                            </span>
                          </div>
                        </div>
                        <a
                          href={`/s/${s.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 text-xs text-blue-500 hover:text-blue-700 font-medium transition-colors pt-0.5"
                        >
                          View →
                        </a>
                      </div>
                    </div>
                  );
                })}
              {intentSignals.filter(s => s.heat === "COLD").length > 0 && (
                <p className="text-xs text-gray-400 text-center pt-1">
                  + {intentSignals.filter(s => s.heat === "COLD").length} cold lead{intentSignals.filter(s => s.heat === "COLD").length !== 1 ? "s" : ""} (no recent activity)
                </p>
              )}
            </div>
          )}
        </div>

        {/* Follow-ups (nurture drafts) */}
        <div className="mt-6 bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400">
              Follow-ups
            </h2>
            {!nurtureLoading && nurtureDrafts.length > 0 && (
              <span className="text-xs text-gray-400">{nurtureDrafts.length} draft{nurtureDrafts.length !== 1 ? "s" : ""} pending</span>
            )}
          </div>

          {nurtureLoading ? (
            <p className="text-sm text-gray-400 text-center py-4">Loading…</p>
          ) : nurtureDrafts.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">
              No follow-up drafts. When rate drops or buyers engage, AI-drafted emails appear here for your review.
            </p>
          ) : (
            <div className="space-y-4">
              {nurtureDrafts.map(draft => {
                const triggerLabel: Record<string, string> = {
                  rate_drop:     "📉 Rate Drop",
                  new_concept:   "🏠 New Floor Plan",
                  re_engagement: "👋 Check-in",
                };
                const clientLabel = draft.recipient_name
                  || draft.shared_links?.client_name
                  || draft.recipient_email
                  || "Buyer";
                const isSending   = nurtureSendingId   === draft.id;
                const isDismissing = nurtureDismissingId === draft.id;
                const msg = nurtureMsg?.id === draft.id ? nurtureMsg : null;

                return (
                  <div key={draft.id} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">
                            {triggerLabel[draft.trigger_type] ?? draft.trigger_type}
                          </span>
                          <span className="text-sm font-semibold text-gray-900 truncate">{clientLabel}</span>
                          {draft.shared_links?.slug && (
                            <a
                              href={`/s/${draft.shared_links.slug}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-blue-500 hover:text-blue-700 shrink-0"
                            >
                              View portal →
                            </a>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 font-medium">To: {draft.recipient_email ?? <span className="text-amber-600">No email — add buyer email in portal</span>}</p>
                      </div>
                    </div>

                    <div className="bg-white rounded-lg border border-gray-100 p-3 mb-3">
                      <p className="text-xs font-semibold text-gray-700 mb-1">Subject: {draft.subject}</p>
                      <p className="text-xs text-gray-600 whitespace-pre-line line-clamp-4">{draft.body}</p>
                    </div>

                    {msg && (
                      <p className={`text-xs mb-2 font-medium ${msg.ok ? "text-emerald-600" : "text-red-600"}`}>{msg.text}</p>
                    )}

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleNurtureSend(draft.id)}
                        disabled={isSending || isDismissing || !draft.recipient_email}
                        className="flex-1 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold py-2 px-3 transition-colors"
                      >
                        {isSending ? "Sending…" : "Send"}
                      </button>
                      <button
                        onClick={() => handleNurtureDismiss(draft.id)}
                        disabled={isSending || isDismissing}
                        className="rounded-lg border border-gray-200 hover:bg-gray-100 text-gray-500 text-xs font-medium py-2 px-3 transition-colors"
                      >
                        {isDismissing ? "…" : "Dismiss"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
