"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface User {
  id: string;
  email: string;
}

interface Subscription {
  status: string;
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

  // Team state
  const [userPlan, setUserPlan] = useState<"free" | "pro" | "team">("free");
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [companyName, setCompanyName] = useState("");
  const [companyNameInput, setCompanyNameInput] = useState("");
  const [savingCompany, setSavingCompany] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteMsg, setInviteMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [teamCheckoutLoading, setTeamCheckoutLoading] = useState(false);
  const [teamCheckoutError, setTeamCheckoutError] = useState("");
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

  // Load team plan + members
  useEffect(() => {
    fetch("/api/team/plan")
      .then(r => r.json())
      .then((d: { plan: "free" | "pro" | "team"; companyName: string }) => {
        setUserPlan(d.plan);
        setCompanyName(d.companyName);
        setCompanyNameInput(d.companyName);
        if (d.plan === "team") loadTeamMembers();
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerId: subscription.customerId }),
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
    window.history.replaceState({}, "", "/dashboard");
    handleSubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const statusInfo = STATUS_LABELS[subscription?.status ?? "inactive"] ?? STATUS_LABELS.inactive;

  return (
    <div className="min-h-screen bg-gray-50">
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
                <span className="text-sm text-gray-500">$49/month</span>
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
              href="/"
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

        {/* ── Team Panel ── */}
        {userPlan === "team" && (
          <div className="mt-6 bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-5">Team Management</h2>

            {/* Company Name */}
            <div className="mb-6">
              <label className="text-xs font-semibold text-gray-500 block mb-1.5">Company Name <span className="text-gray-300">(shown on white-label PDFs)</span></label>
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
              {companyName && <p className="text-xs text-emerald-600 mt-1">✓ Set — PDFs will show "{companyName}" instead of SplanAI</p>}
            </div>

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
                  <h2 className="text-sm font-bold text-gray-800">Unlock unlimited plans</h2>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-blue-600 text-white font-semibold">Most popular</span>
                </div>
                <p className="text-xs text-gray-500">Unlimited generations · Branded PDF · Neighborhood data · $49/mo</p>
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

                  <button
                    onClick={() => handleCopyLink(link.slug)}
                    className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:border-blue-400 hover:text-blue-600 transition-colors"
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
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
