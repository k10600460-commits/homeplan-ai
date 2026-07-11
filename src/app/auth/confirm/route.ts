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

  if (data.user.email) {
    const { sendWelcomeEmail } = await import("@/lib/emails");
    sendWelcomeEmail(data.user.email).catch(console.error);
  }
  if (type === "signup") {
    const { insertEvent } = await import("@/lib/analytics");
    insertEvent("signup_completed", data.user.id, { metadata: { source: "email_confirm" } });
  }
  return NextResponse.redirect(`${origin}/dashboard?new_signup=1`);
}
