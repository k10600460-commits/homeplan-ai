# CLAUDE.md — SplanAI

## Product
SplanAI (splanai.com) is an AI-powered sales tool (SaaS) for small and mid-sized
US home builders. A builder enters lot size, budget, and family size; SplanAI
returns 3 floor-plan proposals as PDFs in ~30 seconds.
- The only correct product name is **SplanAI**. It was formerly "HomePlanAI" —
  never use that name.
- Solo founder: product and engineering decisions are one person's call.

## Customer & go-to-market
- Target customer: small US home builders.
- Home builders are NOT on Product Hunt or X. The PH launch was an
  SEO / credibility / milestone play, not a customer-acquisition channel.
- Post-launch priority is direct outbound sales to builders. Weigh feature and
  marketing ideas against "does this actually reach home builders?"

## Pricing (do not invent or alter; ask if unsure)
- Free: $0/mo — 3 generations/month, SplanAI-branded PDF, neighborhood & market data, client sharing portal. Signup required, no credit card.
- Pro: $49/mo — 100 generations/month, logo-branded PDF, MLS data via Trestle, priority support. 14-day free trial (card required at signup).
- Team: $149/mo — unlimited generations (fair use), white-label PDF, 5–15 users, team dashboard & KPIs, dedicated support. 14-day free trial (card required at signup).
- Founding promo: code PRODUCTHUNT = 100% off first month, valid through 2026-06-30.

## Stack & architecture
- Next.js (App Router): layout.tsx, page.tsx, sitemap.ts, robots.ts.
- Claude API — floor-plan generation.
- Google Maps API (Places API New + Geocoding API) — neighborhood data.
  Note: **"Places API (New)"** must be enabled in GCP Console. Legacy "Places API" is not used
  (fallback was removed in PR#15; only Places API New POST endpoint is active).
- FRED API (St. Louis Fed) — 30yr fixed mortgage rate (`MORTGAGE30US`, weekly). Key: `FRED_API_KEY`
  (Production + Preview, Sensitive). Falls back to 6.5% if unset.
- RentCast API — market data.
- Trestle — MLS data; depends on the user's own MLS license (Pro/Team only).
- Supabase — Realtime on `link_events`; `api_usage_external` tracks external API usage.
- Stripe — payments.
- Customer-facing portal at `/s/[slug]`.

## Coverage & constraints
- AI floor-plan generation and neighborhood data work in all 50 US states.
- RentCast market data: major US metros only, hard cap of 50 requests/month
  SHARED across all users — this is the main bottleneck.
- No geo block or allowlist exists in the code.

## Payments
- The Stripe account is Japan-based.
- PayPal is OUT of scope. PayPal-via-Stripe is only available to EU/UK/CH/NO/LI
  Stripe accounts — not Japan, not the US. Never propose PayPal.
- Cards + Link / Google Pay / Apple Pay cover US B2B SaaS needs.
- Possible future B2B addition is ACH (`us_bank_account`), not PayPal.

## Hard rules
- Never read, print, or modify `.env*` files or any secret / API key.
- Never modify live Stripe configuration (products, prices, webhooks)
  without explicit confirmation in the session.
- Never change file or access permissions / sharing settings.
- Verify before asserting — no unverified claims about how the code works.
- Do not create files or directories outside the established structure
  without flagging it first.

## Working rules
- Verify before asserting. Before stating any fact about how the codebase works
  — architecture, data/cost flow, what a feature does, what consumes API
  credits, how a flow behaves — read the actual code first. Never present an
  unverified inference as established fact; flag assumptions explicitly.
- Launch/strategy notes and investigation outputs go in `docs/launch/` as dated
  Markdown.

## Build & project layout

**Commands**
```
npm run dev      # local dev server (Next.js, port 3000)
npm run build    # production build
npm run start    # serve production build
npm run lint     # ESLint
```

**Key dependencies**
- `next` 16.2.6, `react` 19, `typescript` 5, `tailwindcss` 4
- `@anthropic-ai/sdk` — Claude API calls (floor-plan generation)
- `stripe` + `@stripe/stripe-js` — payments
- `@supabase/supabase-js` + `@supabase/ssr` — auth + DB + Realtime
- `resend` — transactional email
- `pdfmake` + `jspdf` — PDF generation. jsPDF の組み込み Helvetica は WinAnsi (Windows-1252) のみ対応。≈ (U+2248) / em dash (—) / en dash (–) は文字化けするため doc.text() 前に ASCII 変換必須（`Est.` / ` - `）。
- `react-hook-form` + `zod` — form validation

**Directory map**
```
src/
  middleware.ts                  ← Supabase SSR auth middleware (all routes)
  app/
    layout.tsx                   ← root layout + SEO metadata
    page.tsx / HomePageClient.tsx← landing page
    globals.css
    robots.ts / sitemap.ts
    auth/
      callback/route.ts          ← PKCE callback (password reset only)
      confirm/route.ts           ← email confirmation (token_hash + verifyOtp)
    api/
      generate/route.ts          ← Claude API: 3 floor-plan proposals
      generate-pdf/route.ts      ← server-side PDF rendering
      mortgage-rate/route.ts     ← FRED 30yr fixed rate (via src/lib/mortgage-rate.ts)
      neighborhood/route.ts      ← Google Maps neighborhood data
      checkout/route.ts          ← checkout for Pro + Team (LP / login / dashboard)
      stripe/
        checkout/route.ts        ← checkout for Pro only (upgrade page / dashboard Pro path)
        portal/route.ts          ← Stripe billing portal redirect
        team-checkout/route.ts   ← Team plan checkout
        webhook/route.ts         ← Stripe webhook (subscription lifecycle)
      usage/route.ts             ← usage limit checks
      share/
        create/route.ts          ← create shareable plan link
        event/route.ts           ← record link_events (Realtime source)
      team/
        invite/route.ts          ← send team invite email
        accept-invite/route.ts   ← accept invite + provision seat
        members/route.ts         ← list / remove team members
        plan/route.ts            ← Team plan info
        profile/route.ts         ← per-member profile
      mls/
        connect/route.ts         ← save Trestle MLS credentials
        disconnect/route.ts
        lot-data/route.ts        ← fetch real lot data via Trestle
        status/route.ts          ← MLS connection status
      cron/
        finance-snapshot/route.ts← daily MRR / cost snapshot
        daily-brief/route.ts     ← Commander summary email (JST 8:00)
        sales-dm-draft/route.ts  ← 5 outbound DM drafts (JST 8:00)
        seo-draft/route.ts       ← SEO article drafts (Mon/Thu 14:00)
        legal-watch/route.ts     ← NAR/MLS/FTC crawl (Mon 9:00)
        trial-reminder/route.ts  ← trial-ending reminder emails
        reset-external-usage/route.ts ← monthly RentCast counter reset
    dashboard/
      page.tsx / DashboardClient.tsx ← main app UI, Realtime notifications
    login/page.tsx
    results/page.tsx             ← display generated plans
    upgrade/page.tsx             ← upgrade prompt
    s/[slug]/
      page.tsx / SharePortalClient.tsx ← customer-facing shared-plan portal
    invite/page.tsx
    forgot-password/page.tsx
    reset-password/page.tsx
    terms/page.tsx
    privacy/page.tsx
  components/
    ProductHuntBadge.tsx
    SocialProofBar.tsx
  lib/
    stripe.ts                    ← STRIPE_PRICE_ID, TRIAL_PERIOD_DAYS, helpers
    security.ts                  ← rate limiting, IP extraction
    emails.ts                    ← Resend: welcome/trial/followup/cancel/invite
    external-apis.ts             ← Google Maps, RentCast, Trestle wrappers
    usage.ts                     ← Free/Pro/Team generation limit logic
    crypto.ts                    ← share-link slug generation
    mortgage-rate.ts             ← FRED MORTGAGE30US live rate (24h cache); fallback 6.5%
    neighborhood.ts              ← geocodeCity / getNearbyPlaces (Places API New) / haversineKm
    concept-style-image.ts       ← style name → public/concept-styles/*.jpg mapping
    zh-pdf-html.ts               ← PDF HTML template (jspdf path)
    supabase/
      client.ts                  ← browser Supabase client
      server.ts                  ← server-side Supabase client (SSR cookies)
agents/
  sales.md                       ← outbound DM patterns / funnel / KPI / white-glove rules
  commander.md                   ← daily brief / escalation / automation protocol
  x-content-agent.md             ← @SplanAI X draft agent (SEO/brand only, not customer acquisition)
scripts/
  x-analytics-sync.ts            ← X post metrics sync (own posts only, Free tier)
```

**Infrastructure references**
- Vercel: `prj_rGL6KyhgwqNiPslh87pyoHynECeN` / team `team_gxfE3mshtmQ4BdZLtMF1rnD5` / domain `splanai.com`
- Supabase: project `SplanAI` / id `sabriblwzzsvxsfxoebe`
- Stripe: Japan account / Live USD / webhook `vibrant-oasis` → `https://splanai.com/api/stripe/webhook`
- GitHub: `k10600460-commits/homeplan-ai` (repo name intentionally differs from product name — do not rename)

## コミット/デプロイ運用
- タスク完了後、`npm run build` が通ったら自動で `git add -A && git commit` を実行する（メッセージは変更内容から簡潔に生成）。ユーザーへの手動コミット依頼は不要。
- `git push` は自動実行しない。main への push = 即本番デプロイのため、push は必ずユーザーが手動（ship）で行う。
- 決済/認証/法務/セキュリティ/DBマイグレーション等のリスク変更は、push 前に検証専用 /goal を別途流す方針を維持。
