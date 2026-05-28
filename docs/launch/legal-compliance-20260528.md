# Legal & Compliance Changes — 2026-05-28

## Goal
プライバシーポリシーと利用規約をサイトに追加し、同意・免責の導線を整備。

## Summary

Build: ✅ `Compiled successfully` / 37 pages

---

## 1. Legal documents — content/legal/

Canonical MD files copied from `~/Downloads`, stripping `> _Note:` header line.

| File | Destination |
|------|-------------|
| `privacy-policy.md` | `content/legal/privacy-policy.md` |
| `terms-of-service.md` | `content/legal/terms-of-service.md` |

**`/privacy` and `/terms` pages** existed with comprehensive content. Updated `LAST_UPDATED` date to match canonical MD (May 28, 2026).

- [src/app/privacy/page.tsx:10](../../src/app/privacy/page.tsx#L10) — `"May 22, 2026"` → `"May 28, 2026"`
- [src/app/terms/page.tsx:10](../../src/app/terms/page.tsx#L10) — `"May 24, 2026"` → `"May 28, 2026"`

---

## 2. Footer links (Terms / Privacy)

| Page | Status |
|------|--------|
| Landing page (`HomePageClient.tsx`) | ✅ already present |
| `/privacy` page | ✅ already present |
| `/terms` page | ✅ already present |
| `/login` page | ✅ added footer |
| `/upgrade` page | ✅ added footer |
| `/results` page | ✅ added footer |
| `/s/[slug]` share portal | ✅ added to existing footer |

Footer markup added to login, upgrade, results pages — `Terms · Privacy · © 2026 SplanAI`.

---

## 3. Signup consent checkbox

**[src/app/login/page.tsx](../../src/app/login/page.tsx)**

- Added `agreedToTerms` state (default `false`)
- Required checkbox: "I agree to the **Terms of Service** and **Privacy Policy**" (each word linked)
- Submit button disabled when `!agreedToTerms`
- `terms_agreed_at: new Date().toISOString()` passed as `user_metadata` to `supabase.auth.signUp()`
- Removed passive "By signing up, you agree to..." paragraph (replaced by checkbox)

---

## 4. Trial / pricing disclaimers

**[src/app/HomePageClient.tsx](../../src/app/HomePageClient.tsx)**

| Plan | Before | After |
|------|--------|-------|
| Pro (EN) | `"14-day free trial · Cancel anytime"` | `"14-day free trial, then $49/mo. Cancel anytime before it ends."` |
| Team (EN) | `"5–15 users · Cancel anytime"` | `"14-day free trial, then $149/mo. Cancel anytime before it ends."` |
| Pro (ES) | `"14 días de prueba · Cancela cuando quieras"` | `"14 días de prueba gratis, luego $49/mes. Cancela antes que termine."` |
| Team (ES) | `"5–15 usuarios · Cancela cuando quieras"` | `"14 días de prueba gratis, luego $149/mes. Cancela antes que termine."` |

**[src/app/upgrade/page.tsx:92](../../src/app/upgrade/page.tsx#L92)**

`"14-day free trial • Cancel anytime"` → `"14-day free trial, then $49/mo. Cancel anytime before it ends."`

---

## 5. AI disclaimers

### Results page — screen

**[src/app/results/page.tsx](../../src/app/results/page.tsx)** — added above plan cards:

> AI-generated concept — illustration only. Not an architectural or engineering plan. Verify with a licensed professional before construction.

### Results page — PDF footer

**[src/app/results/page.tsx:246](../../src/app/results/page.tsx#L246)** — `drawFooter()`:

Before: `"For informational purposes only. Data subject to change. Not a substitute for professional architectural or legal advice."`

After: `"Floor-plan concepts are AI-generated for preliminary illustration only. They are not construction-ready drawings and may not comply with building codes or zoning. Verify with licensed professionals before relying on them."`

### Share portal `/s/[slug]`

**[src/app/s/[slug]/SharePortalClient.tsx](../../src/app/s/[slug]/SharePortalClient.tsx)** — added in footer section:

> AI-generated concept — illustration only. Not an architectural or engineering plan. Verify with a licensed professional before construction.

Plus Terms / Privacy links added to share portal footer.

### Chinese PDF template

**[src/lib/zh-pdf-html.ts:65](../../src/lib/zh-pdf-html.ts#L65)**

Appended English disclaimer alongside existing Chinese text:

> 仅供参考。数据可能变动。不构成专业建筑或法律建议。Floor-plan concepts are AI-generated for preliminary illustration only. They are not construction-ready drawings and may not comply with building codes or zoning. Verify with licensed professionals before relying on them.

---

## Pending (user action required)

- Preview deploy to verify UI rendering of checkbox, disclaimers, and footer links
- Push to production (stop before push per guardrail)
