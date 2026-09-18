import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { checkUsageLimit } from "@/lib/usage";
import DashboardClient from "./DashboardClient";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ new_signup?: string; plan?: string; checkout?: string }>;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { new_signup, plan, checkout } = await searchParams;

  // Fetch subscription status
  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("status, trial_end, current_period_end, stripe_customer_id, cancel_at_period_end, plan")
    .eq("user_id", user.id)
    .maybeSingle();

  // cancel_at_period_end users are still "active" until period ends
  const isActive =
    subscription?.status === "active" || subscription?.status === "trialing";

  // A user without a subscription row is NOT "no plan" — they are on Free with a
  // real monthly allowance (PLAN_LIMITS.free). The dashboard used to tell them
  // "No Plan / No active subscription", which reads as "you have nothing" and
  // pushes them at the $49 checkout before they have tried the product once.
  // Surface the actual allowance instead.
  const usage = await checkUsageLimit(user.id);

  return (
    <DashboardClient
      user={{ id: user.id, email: user.email ?? "" }}
      usage={{ plan: usage.plan, current: usage.current, limit: usage.limit, remaining: usage.remaining }}
      isNewSignup={new_signup === "1"}
      newSignupPlan={plan === "team" || plan === "pro" ? plan : undefined}
      checkoutSuccess={checkout === "success"}
      subscription={
        subscription
          ? {
              status: subscription.status,
              plan: (subscription.plan as "free" | "pro" | "team") ?? "pro",
              trialEnd: subscription.trial_end,
              periodEnd: subscription.current_period_end,
              customerId: subscription.stripe_customer_id,
              cancelAtPeriodEnd: subscription.cancel_at_period_end ?? false,
              isActive,
            }
          : null
      }
    />
  );
}
