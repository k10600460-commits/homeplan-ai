"use client";

import { useState } from "react";
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

export default function DashboardClient({ user, subscription }: Props) {
  const router = useRouter();
  const [portalLoading, setPortalLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [signOutLoading, setSignOutLoading] = useState(false);

  const supabase = createClient();

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
      </div>
    </div>
  );
}
