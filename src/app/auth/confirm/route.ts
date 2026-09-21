import type { EmailOtpType } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  if (!token_hash || !type) {
    return NextResponse.redirect(`${origin}/login?error=auth_error`);
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );

  const { data, error } = await supabase.auth.verifyOtp({ token_hash, type });

  if (error || !data.user) {
    console.error("[auth/confirm] verifyOtp error:", error?.message);
    return NextResponse.redirect(`${origin}/login?error=auth_error`);
  }

  // Supabase's "Confirm signup" template was changed to send type=email
  // (OI-R13, to fix the cross-browser PKCE failure). Gating on type === "signup"
  // therefore never matched: signup_completed has 0 rows for the entire life of
  // the table against three confirmed signups, so the top of the funnel has been
  // invisible the whole time. Password recovery and email change carry their own
  // types and must not be treated as a new signup — they would otherwise get a
  // welcome email and the ?new_signup=1 onboarding flag.
  const isSignupConfirm = type === "signup" || type === "email";

  if (isSignupConfirm && data.user.email) {
    const { sendWelcomeEmail } = await import("@/lib/emails");
    sendWelcomeEmail(data.user.email).catch(console.error);
  }
  if (isSignupConfirm) {
    const { insertEvent } = await import("@/lib/analytics");
    insertEvent("signup_completed", data.user.id, {
      metadata: { source: "email_confirm", otp_type: type },
    });
  }
  return NextResponse.redirect(
    `${origin}/dashboard${isSignupConfirm ? "?new_signup=1" : ""}`,
  );
}
