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

interface Props {
  user: User;
  subscription: Subscription | null;
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

export default function DashboardClient({ user, subscription }: Props) {
  const router = useRouter();
  const [portalLoading, setPortalLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [signOutLoading, setSignOutLoading] = useState(false);
  const [sharedLinks, setSharedLinks] = useState<SharedLink[]>([]);
  const [newViewAlert, setNewViewAlert] = useState<string | null>(null);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);

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
    const res = await fetch("/api/stripe/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: user.id, email: user.email }),
    });
    const data = await res.json();
    if (data.url) window.location.href = data.url;
    else setCheckoutLoading(false);
  }

  const statusInfo = STATUS_LABELS[subscription?.status ?? "inactive"] ?? STATUS_LABELS.inactive;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Nav */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <a href="/" className="text-xl font-bold tracking-tight text-gray-900">
            HomePlan<span className="text-blue-600">AI</span>
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

            {subscription ? (
              <div className="space-y-2 text-sm text-gray-600 mb-6">
                {subscription.status === "trialing" && subscription.trialEnd && (
                  <p>Trial ends: <span className="font-medium text-gray-900">{formatDate(subscription.trialEnd)}</span></p>
                )}
                {subscription.status === "active" && subscription.periodEnd && (
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
                {portalLoading ? "Loading…" : "Manage Billing"}
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

        {/* Shared Links panel */}
        <div className="mt-6 bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400">
              Shared Client Links
            </h2>
            {sharedLinks.length > 0 && (
              <span className="text-xs text-gray-400">{sharedLinks.length} link{sharedLinks.length !== 1 ? "s" : ""}</span>
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
