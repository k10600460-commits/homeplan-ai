---
name: lp-anti-slop
description: Anti-slop guard for splanai.com marketing pages (landing page, /try, /partners, signup copy). Use before creating or editing any marketing page, section, or customer-facing copy under src/app (page.tsx, HomePageClient.tsx, lp-copy.ts, lp-sample.ts, try/, partners/). DESIGN.md is the core and always wins; this skill only bans LLM defaults. Not for dashboard, generate, or portal UI.
---

# lp-anti-slop: LLM defaults banned on the marketing surface

## 0. Priority (read this first)

1. `DESIGN.md` (the core: what SplanAI looks like) wins over everything in this file.
2. This skill bans LLM defaults (what every AI-built page looks like). It never adds style.
3. Upstream `Leonxlnx/taste-skill` is NOT installed on purpose (87 KB of context, v2 experimental, five conflicts below). This file is the SplanAI-filtered extract (PPP-080).

Conflicts already decided in DESIGN.md's favour. Do not "fix" these:
- Dials are trust-first: VARIANCE 3-4 / MOTION 2-3 / DENSITY 4-5. The upstream default 8/6/4 is wrong for a 50-year-old builder screen-sharing a $600K deal.
- Page theme: ink sections alternate with paper sections by design. No "page theme lock", no dark mode.
- Icons: one inline stroke SVG set (`lp-icons.tsx`). No icon library.
- Typography: Geist only. No Inter, no second family, no font-mono.
- En-dash inside numeric ranges ("$623–$685K", "2,650–2,900") is correct. Everywhere else it is banned.

## 1. Design read (fixed for this repo)

"Reading this as: B2B SaaS landing for US custom / semi-custom home builders (10-50 homes a year), trust-first, on the DESIGN.md system: Geist, ink/paper, one action blue, blueprint grid, 1 section = 1 effect, evidence = real product output."

State that read in one line before touching a new marketing page. Do not ask about aesthetics; the read is fixed.

## 2. Before writing (redesign protocol)

- Read `DESIGN.md`, then the funnel guards in `src/app/lp-guards.test.ts`.
- Audit first: tokens in use, information architecture, conversion paths (`LP_ROUTES`), what is doing work, what is filler.
- Never change silently: route slugs, nav labels, form field names, `track("cta_click", { button })` ids, legal gating copy (MLS, fair use), prices. If a change needs one of these, say so and stop.
- Copy is customer-facing: rewriting existing strings is a Shoji decision (HUMANIZE). Run `/verify-copy` on new English copy.

## 3. Banned LLM defaults

Evidence
- Product UI built from styled divs in the hero, invented numbers, invented testimonials. The hero shows the real sample portal (`SAMPLE_PORTAL`, /s/nfhkewvz). Real numbers only.
- Placeholder names or brands (Jane Doe, Acme), fake-perfect numbers (99.99%), fake social proof ("Trusted by 10,000+", "Quietly trusted by").

Copy
- Em-dash as a separator: the single most common tell. Existing ones are frozen by the ratchet in `lp-anti-slop.test.ts`; never add one. Use a period, comma or colon.
- Filler verbs and hype: AI-powered, revolutionary, game-changing, seamless, cutting-edge, effortless (HUMANIZE) plus Elevate, Unleash, Next-Gen, Revolutionize, Supercharge.
- "Step 1 / Phase 1 / Paso 1" labels (the step content is the label; the editorial "01 02 03" numerals are fine), scroll cues ("Scroll to explore"), version labels (BETA, v1.2, early access), locale or time strips, micro-meta sentences under headings, poetic section labels ("From the field").
- Hero copy: headline max 2 lines, subtext target 20 words (current EN 38 / ES 41 is approved copy; shorten only in a Shoji-approved copy pass), 1 primary + 1 secondary CTA, max 4 text elements.

Layout
- An eyebrow (small uppercase label) above every section. Cap: ceil(sections / 3). Badges (PLAN 1, PRO, Live sample) are not eyebrows.
- Split header (big headline left, small paragraph floating right). Stack vertically instead.
- Three equal cards as a reflex. Allowed here only when the count is real content (3 pains, 3 differentiators, 3 concepts).
- More than 2 consecutive image/text zigzags, empty bento cells, a nav on 2 lines or taller than 80px.

Visual and motion
- AI-purple or mesh gradients, glow stacking, pure #000 / #fff, custom cursors, emoji as icons, inline hex colours (DESIGN.md items 1, 2, 4, 8).
- `window.addEventListener("scroll")`, `onScroll`, `requestAnimationFrame` loops, JS reveals, infinite loops, standalone `h-screen`. Motion is the CSS scroll-driven `.reveal` only; reduced motion is always respected.

## 4. Pre-flight

Mechanical: run `npm test`. `lp-anti-slop.test.ts` and `lp-guards.test.ts` must be green:
em-dash ratchet unchanged, en-dash only in numeric ranges, zero-tolerance patterns absent, eyebrow cap, no scroll listeners / rAF / h-screen, funnel routes, EN/ES parity, pricing copy, HUMANIZE words.

Human (say what you checked):
- 375px: no orphan words in headings, both hero CTAs visible without scrolling, nothing hidden before JS.
- Read every new string aloud once. Real numbers only.

## 5. Provenance

Ban list extracted and adapted from Leonxlnx/taste-skill (MIT, Copyright (c) 2026 Leonxlnx), upstream commit a6153b3 (2026-09-22), sections 0.D, 4.7, 9 and 14, per PPP-080 (obsidian-vault: SplanAI/00_Decisions/ppp-080-taste-skill-anti-slop-frontend-20260923). Kept to the parts that survive DESIGN.md. Re-check upstream only when a brand-new marketing page is built from scratch.
