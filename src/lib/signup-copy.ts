/**
 * Copy for the /login signup tab, keyed on the ?plan= query param.
 *
 * Only a signup that explicitly carries ?plan=pro|team is a paid trial.
 * Anything else — including no param or an unknown value — is a free
 * account (PLAN_LIMITS.free = 3/month, no card), and must never see
 * trial, price or "unlimited" language. Pinned by signup-copy.test.ts.
 *
 * Mirrors src/lib/usage.ts PLAN_LIMITS: free 3 / pro 100 / team fair-use.
 */
export type SignupPlan = "pro" | "team";

export function isPaidSignupPlan(plan: string | null | undefined): plan is SignupPlan {
  return plan === "pro" || plan === "team";
}

export interface SignupCopy {
  /** true only for ?plan=pro|team */
  paid: boolean;
  /** Tab header next to "Sign In" */
  tabLabel: string;
  heading: string;
  sub: string;
  bullets: readonly string[];
  /** Submit button label */
  submit: string;
  /** "Don't have an account?" link text on the Sign In tab */
  switchToSignup: string;
}

const FREE: SignupCopy = {
  paid: false,
  tabLabel: "Create free account",
  heading: "Create your free account",
  sub: "3 proposals a month. No credit card required.",
  bullets: ["3 proposals a month", "No credit card required", "PDF export included", "Upgrade anytime"],
  submit: "Create free account →",
  switchToSignup: "Create a free account",
};

export function signupCopy(plan: string | null | undefined): SignupCopy {
  if (!isPaidSignupPlan(plan)) return FREE;
  const team = plan === "team";
  const price = team ? "$149" : "$49";
  return {
    paid: true,
    tabLabel: "Start free trial",
    heading: "Start your free trial",
    sub: `14 days free, then ${price}/month. Cancel anytime.`,
    bullets: [
      "14-day free trial — no charge today",
      team ? "Unlimited proposals (fair use)" : "100 proposals a month",
      team ? "White-label PDF export" : "PDF export with your branding",
      "Cancel anytime before trial ends",
    ],
    submit: "Start free trial →",
    switchToSignup: "Start your free trial",
  };
}
