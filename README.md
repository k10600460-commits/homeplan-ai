# 🏠 SplanAI

> **Close more deals. Show clients their dream home before they sign.**

An AI-powered home planning tool for residential builders in the USA. Generate 3 custom home plans instantly with a single land description.

**Live:** [splanai.com](https://splanai.com)  
**Launch Date:** May 26, 2026 (ProductHunt)

---

## 📋 Product Overview

**Who it's for:** Small to mid-sized home builders (10–50 homes/year)

**What it does:**
1. Builder inputs land details (lot size, shape, utilities, etc.)
2. AI generates **3 complete home plans in 30 seconds**
3. Export as **PDF with branding** for client presentations
4. Track usage and manage team subscriptions

**Why it matters:**
- **Sales tool, not design software** — Speed closes deals
- **No CAD skills required** — Builders can generate plans in seconds
- **Pre-sales engagement** — Show clients their dream home before they sign

---

## 💰 Pricing

| Plan | Price | Limits | Features |
|------|-------|--------|----------|
| **Free** | $0 | 3 plans/month | PDF export, basic home plans |
| **Pro** | $49/mo | Unlimited | 14-day free trial, custom branding, priority support |
| **Team** | $149/mo | Unlimited | 14-day free trial, 5–15 users, white-label PDF, team dashboard |

Upgrade path: Free → Pro → Team (via Stripe)  
Payment methods: Card / Google Pay / Link / Apple Pay (PayPal not supported)

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | Next.js 16 (App Router) + TypeScript + Tailwind CSS |
| **Backend** | Supabase (PostgreSQL, Auth, RLS) |
| **AI** | Anthropic Claude API |
| **Payments** | Stripe (checkout, webhooks, portal) |
| **Maps** | Mapbox GL |
| **PDF Export** | html2canvas + jsPDF |
| **Deploy** | Vercel |

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- npm/yarn/pnpm

### Installation

```bash
# Clone the repo
git clone https://github.com/yourusername/homeplan-ai.git
cd homeplan-ai

# Install dependencies
npm install

# Set up environment variables (see .env.example)
cp .env.example .env.local

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

### Environment Variables

Create a `.env.local` file with:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Anthropic Claude API
ANTHROPIC_API_KEY=

# Stripe
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_ID=

# App Config
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## 📁 Project Structure

```
src/
├── app/
│   ├── page.tsx              # Landing page (sales funnel)
│   ├── layout.tsx            # Root layout (SEO metadata)
│   ├── api/
│   │   ├── generate/         # AI plan generation endpoint
│   │   ├── stripe/           # Payments (checkout, webhook, portal)
│   │   ├── usage/            # API usage tracking
│   │   └── auth/             # Supabase auth callback
│   ├── auth/
│   │   ├── callback/         # PKCE callback (password reset only)
│   │   └── confirm/          # Email confirmation via token_hash (added 2026-05-24)
│   ├── dashboard/            # User dashboard (plans history, usage)
│   ├── login/                # Authentication UI
│   ├── results/              # Generated plans display & PDF export
│   └── upgrade/              # Upgrade flow
├── lib/
│   ├── stripe.ts             # Stripe utilities
│   ├── usage.ts              # Usage quota logic
│   └── supabase/             # Supabase client & server
└── globals.css               # Tailwind + global styles
```

---

## 🔌 API Endpoints

### Generate Plans
**POST** `/api/generate`
```json
{
  "land_size": "0.5 acres",
  "lot_shape": "rectangular",
  "utilities": "full"
}
→ { "plans": [...], "usage_remaining": 2 }
```

### Usage Info
**GET** `/api/usage`
```json
→ { "used": 1, "limit": 3, "plan": "free" }
```

### Stripe Webhook
**POST** `/api/stripe/webhook` — Handles subscription events (auto-updates DB)

---

## 📊 Database Schema

### `users` (via Supabase Auth)
- `id`, `email`, `created_at`

### `subscriptions`
- `user_id`, `status`, `stripe_customer_id`, `current_period_end`

### `api_usage`
- `user_id`, `plans_generated`, `reset_date`

### RLS (Row Level Security)
- Users can only access their own data

---

## 🧪 Testing the Full Flow

1. **Sign up** at [localhost:3000](http://localhost:3000)
2. **Generate a plan** (Free tier: 3 plans)
3. **Download PDF** (branding included)
4. **Upgrade to Pro** (14-day free trial via Stripe Test)
   - Use test card: `4242 4242 4242 4242` (Stripe)
5. **Check usage** in dashboard

---

## 📝 Development Notes

- **Next.js version:** 16.2.6 (breaking changes possible — check `node_modules/next/dist/docs/`)
- **Environment:** Production Stripe keys enabled (banking info & KYC verified)
- **Database:** Supabase RLS policies enforce user isolation
- **AI:** Claude Opus for plan generation (cost-optimized)

---

## 🎯 Roadmap

- [x] Step 1: Core AI generation + PDF export
- [x] Step 2: Supabase Auth + user DB
- [x] Step 3: Usage quotas (Free/Pro)
- [x] Step 4: Branded PDF output
- [x] Step 5: Stripe webhook integration
- [x] Step 6: Vercel deployment + production activation
- [x] Step 7: Landing page optimization (SEO, OGP, pricing)
- [x] Step 6.5: Security hardening (checkout auth, rate limiting, HTTP headers)
- [x] Step 8: Production E2E testing + auth_error bug fix (cross-browser email confirmation)
- [ ] Step 9: ProductHunt launch (May 26, 2026)

**Implemented (post-launch):**
- Shareable plan links with real-time view tracking
- Mortgage calculator integration
- Zillow listing links
- MLS data (Trestle API)
- Team plan (multi-user, white-label)
- Client sharing portal

---

## 🛡️ Security

- `.env.local` excluded from git (see `.gitignore`)
- Supabase RLS: Users can only access their own plans
- Stripe webhook signature verification enabled
- Claude API key server-side only
- CORS configured for trusted domains

---

## 📞 Support & Contributing

For issues or feature requests, open a GitHub issue. For security concerns, contact the maintainer directly.

---

## 📄 License

Private project. All rights reserved.
