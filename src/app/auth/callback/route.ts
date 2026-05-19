import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
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
              cookieStore.set(name, value, options),
            );
          },
        },
      },
    );

    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      // New sign-up confirmed via email → redirect to Stripe checkout
      const isNewUser = data.user.created_at === data.user.last_sign_in_at;
      if (isNewUser && data.user.email) {
        const { sendWelcomeEmail } = await import("@/lib/emails");
        sendWelcomeEmail(data.user.email).catch(console.error);
      }
      if (isNewUser) {
        const checkoutRes = await fetch(`${origin}/api/stripe/checkout`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: data.user.id, email: data.user.email }),
        });
        const checkoutData = await checkoutRes.json();
        if (checkoutData.url) {
          return NextResponse.redirect(checkoutData.url);
        }
      }

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_error`);
}
