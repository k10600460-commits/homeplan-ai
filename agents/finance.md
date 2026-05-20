# 💰 HomePlanAI Finance Agent

**Role:** Revenue, Cost Management & Financial Operations  
**Sprint:** Ongoing (Launch + Month 1+)  
**Deadline:** Continuous monitoring  
**Status:** Pre-Launch Setup

---

## Mission

Establish financial infrastructure to track revenue, manage costs, and optimize unit economics. Ensure profitability at scale while maintaining operational transparency.

---

## Product Monetization

**Pricing Tiers:**
- **Free:** $0/month, 3 plans/month, PDF export available
- **Pro:** $49/month (includes 14-day free trial), unlimited plans, custom branding

**Revenue Model:**
- Freemium → paid conversion
- Monthly recurring revenue (MRR) + churn tracking
- Stripe payment processor (2.9% + $0.30 per transaction)

---

## Financial Infrastructure

### 1. **Stripe Production Setup** 💳

**Status:** Production account verified (KYC, banking info complete)

**Configuration:**
```
Product: HomePlanAI Pro
Price: $49.00/month (USD)
Billing: Monthly, auto-renew
Trial: 14 days (no credit card required)
Currency: USD (primary), EUR/GBP (future)
```

**Payment Methods Enabled:**
- ✓ Credit/Debit cards (Visa, Mastercard, Amex, Discover)
- [ ] Apple Pay (future)
- [ ] Google Pay (future)
- [ ] Bank transfers (future)

**Webhook Endpoint:**
```
https://homeplan-ai.vercel.app/api/stripe/webhook
Events monitored:
- checkout.session.completed
- customer.subscription.created
- customer.subscription.updated
- customer.subscription.deleted
- payment_intent.failed
- charge.refunded
```

**Test Credentials:**
```
Test Mode Cards:
✓ Success: 4242 4242 4242 4242
✓ Declined: 4000 0000 0000 0002
✓ Requires auth: 4000 0025 0000 3155
```

---

### 2. **Revenue Projections (Year 1)** 📈

**Assumptions:**
- Month 1: 500 signups (ProductHunt launch effect)
- Free → Pro conversion rate: 5–10%
- Churn rate: 5–8% per month (seasonal)
- Growth: 20% month-over-month (steady state)

**Financial Model:**

| Month | Signups | Free Users | Pro Users | MRR | YoY ARR |
|-------|---------|-----------|-----------|-----|---------|
| Jun | 500 | 475 | 25 | $1,225 | ~$15K |
| Jul | 600 | 570 | 30 | $1,470 | ~$18K |
| Aug | 720 | 684 | 36 | $1,764 | ~$21K |
| Sep | 864 | 820 | 44 | $2,156 | ~$26K |
| Oct | 1,037 | 984 | 53 | $2,587 | ~$31K |
| Nov | 1,244 | 1,181 | 63 | $3,087 | ~$37K |
| Dec | 1,493 | 1,417 | 76 | $3,724 | ~$45K |
| **Dec Total** | **6,353** | **6,031** | **327** | **$3,724** | **~$45K/yr** |

**Sensitivity Analysis:**

```
Scenario A: 10% conversion (base case above)
Year 1 ARR: $45K

Scenario B: 15% conversion (optimistic)
Year 1 ARR: $67K

Scenario C: 5% conversion (pessimistic)
Year 1 ARR: $23K
```

---

### 3. **Operating Costs** 💸

**Fixed Monthly Costs:**

| Item | Cost | Notes |
|------|------|-------|
| Anthropic Claude API | $0.30/plan | ~$150/mo (based on $150 free allocation) |
| Supabase (database) | $25–100/mo | Pay-as-you-go tier |
| Vercel (hosting) | $20–50/mo | Pro plan + serverless functions |
| Mapbox (maps, if used) | $0–50/mo | $200 free tier (covers ~50 builders) |
| Domain + SSL | $15/year | ~$1.25/mo |
| Email (Resend/SendGrid) | $20–50/mo | Transactional emails |
| Analytics (Mixpanel) | $0–150/mo | Free tier + paid events |
| Monitoring (Sentry) | $0–50/mo | Error tracking |
| **Total Fixed** | **~$300–500/mo** | |

**Variable Costs (per plan generated):**

| Item | Cost | Notes |
|------|------|-------|
| Claude API (Opus model) | $0.015 per plan | ~3,000 tokens per request |
| Stripe processing | $1.47 per Pro signup | 2.9% + $0.30 per transaction |
| **Total Variable** | **~$0.015–2.00** | Depends on mix (Free vs Pro) |

**Unit Economics (Month 1 estimate):**
```
Pro User Acquisition:
- Stripe fee per signup: $1.47
- Claude API cost/month: ~$0.30 (if user generates 20 plans)
- Total monthly cost per Pro user: ~$1.77
- Revenue per Pro user: $49.00
- Gross margin: 96.4%
```

---

### 4. **Cost Control Strategy** 🎯

**API Optimization:**
- [ ] Claude API quota limits per tier:
  - Free: 3 plans/month = $0.045 cost
  - Pro: 100 plans/month = $1.50 cost
- [ ] Batch requests to reduce token overhead
- [ ] Cache frequently generated floor plans
- [ ] Monitor cost anomalies (alert if > $200/day)

**Infrastructure Optimization:**
- [ ] Supabase: Use read replicas at scale
- [ ] Vercel: Function timeout optimization
- [ ] CDN caching for static assets
- [ ] Compress PDFs before download

**Payment Optimization:**
- [ ] Stripe: Use Radar for fraud detection
- [ ] Offer annual billing (10% discount) to reduce churn
- [ ] Implement dunning management for failed payments

---

### 5. **Revenue Dashboard** 📊

**KPIs to Track (Daily):**

```
Dashboard URL: [Internal analytics link]

Real-Time:
- Active users (24h)
- Plans generated today
- Free tier: [count]
- Pro tier: [count]

Monthly:
- MRR (recurring revenue)
- Churn rate (% Pro users cancelled)
- Conversion rate (Free → Pro)
- CAC (customer acquisition cost)
- LTV (lifetime value)
- ARPU (average revenue per user)

Finance:
- API costs (today, this month YTD)
- Stripe processing fees
- Gross margin %
- Profit/loss
```

**Tools:**
- Stripe Dashboard (native analytics)
- Supabase Analytics (query builder)
- Google Sheets (pivot tables for reporting)
- [Optional: Mixpanel for custom dashboards]

---

### 6. **Monthly Financial Report** 📋

**Template (Due 1st of each month):**

```
📊 HomePlanAI Financial Report — [Month/Year]

Signups & Users:
- New signups: [N]
- Free tier: [N]
- Pro tier: [N]
- Churn (Pro): [%]

Revenue:
- MRR: $[N]
- Stripe fees: $[N]
- Net revenue: $[N]

Costs:
- Claude API: $[N]
- Infrastructure: $[N]
- Total: $[N]

Profitability:
- Gross margin: [%]
- Operating margin: [%]
- Break-even status: [On track / At risk]

Key Metrics:
- CAC: $[N]
- LTV: $[N]
- LTV:CAC ratio: [N:1]
- Payback period: [N] months

Notable Events:
- [Sales spike / issue / opportunity]

Next Month Forecast:
- Expected MRR: $[N]
- Risk factors: [list]
```

---

### 7. **Break-Even Analysis** ⚖️

**Question:** When does HomePlanAI become profitable?

**Assumptions:**
- Fixed costs: $400/month
- Variable cost per Pro user: $1.77/month
- Variable cost per Free user: $0.015/month (API only)
- Pro subscription: $49/month

**Break-Even Point:**

```
Fixed Costs = (Pro Users × $47.23) + (Free Users × API cost)

At Month 6:
- 63 Pro users × $47.23 = $2,975
- 1,181 Free users × $0.015 = $18
- Total contribution: ~$3,000 vs. Fixed: $400
- Result: PROFITABLE ✓

Scenario: If churn increases to 15%/month
- Fewer Pro users retained
- Takes 1–2 months longer to break even

Contingency: If no sales traction
- Break-even delayed 6+ months
- May require cost cuts or fundraising
```

---

### 8. **Funding Considerations** 💼

**Current Status:** Bootstrapped (no external funding)

**If Fundraising Needed:**
- Runway with current costs: 6–12 months (depending on revenue)
- Growth strategy: Target $100K ARR by Month 12
- Funding ask: Seed round ($500K–$1M) if aggressive growth

**Investors to Target:**
- Real estate tech (PropTech) VCs
- Early-stage SaaS accelerators
- Angel investors in construction tech

---

### 9. **Pricing Strategy (Future Iterations)** 📈

**Year 1 (Current):**
- Free: 3 plans/month
- Pro: $49/month, unlimited plans

**Year 2 (Proposed):**
- Free: 3 plans/month (unchanged)
- Pro: $49/month → $59/month (+ API, higher demand)
- Enterprise: $199/month (team features, API access, priority support)

**Rationale:**
- Pro tier price increase: 20% (industry standard SaaS increase)
- Enterprise tier: Capture high-value builder firms (100+ homes/year)
- Annual billing discount: 10–15% to improve retention

---

### 10. **Tax & Accounting** 📋

**Requirements (USA):**
- [ ] Sales tax: Varies by builder location (if applicable)
- [ ] Income tax: Quarterly estimated taxes on MRR
- [ ] VAT/GST: Not applicable (USA), but needed for Canada/EU expansion
- [ ] Contractor 1099s: If outsourcing contractors
- [ ] Accounting software: Quickbooks or Stripe Tax

**Compliance:**
- [ ] Open Stripe merchant account (done ✓)
- [ ] Register business entity (LLC/C-Corp)
- [ ] EIN (Employer ID Number)
- [ ] Sales tax nexus registration (if required)
- [ ] Annual tax filing (April 15)

---

## Finance Checklist (Pre-Launch)

- [x] Stripe production account (KYC verified)
- [x] Pricing tiers configured
- [x] Webhook endpoint live
- [ ] Financial model spreadsheet created
- [ ] Dashboard/reporting set up
- [ ] Monthly reporting template
- [ ] Cost monitoring alert system configured
- [ ] Accounting software connected
- [ ] CFO/finance advisor on-call
- [ ] Risk register created

---

## Finance Checkpoints

**May 26 (Launch Day):**
- Monitor real-time revenue + costs
- Set alert thresholds for anomalies

**June 1 (First Monthly Report):**
- Compile Month 1 financials
- Analyze Free → Pro conversion
- Review Claude API costs vs. budget

**July 1 & Monthly:**
- Recurring monthly financial report
- Adjust forecast based on actuals
- Evaluate pricing adjustments if needed

---

## Post-Launch: Daily Snapshot (Cron 毎朝 6:00 JST)

### Snapshot 収集ロジック

```typescript
// /api/cron/finance-snapshot
const snapshot = {
  date: new Date().toISOString().slice(0, 10),

  // Stripe から集計
  mrr: await sumActiveSubscriptions(),           // active plan='pro' × $49
  arr: mrr * 12,
  active_pro: await countByPlanStatus('pro', 'active'),
  active_team: await countByPlanStatus('team', 'active'),
  trialing: await countByStatus('trialing'),
  churned_today: await countCanceledToday(),
  refunded_today: await sumRefundsToday(),

  // API コスト（各サービスの usage ログから）
  api_cost_anthropic: await getAnthropicUsageToday(),
  api_cost_resend: await getResendUsageToday(),
  total_cost_today: sum(above),

  // 計算値
  gross_margin: mrr > 0 ? (mrr - total_cost_today * 30) / mrr : null,
};

await supabase.from('finance_snapshots').insert(snapshot);
```

### Phase 判定ロジック

```typescript
const mrr = snapshot.mrr;

if (mrr < 500) {
  phase = 0;
  // → 追加投資ゼロ。現状維持。
} else if (mrr < 2500) {
  phase = 1;
  // → 推奨投資: Vercel Pro $20 + Supabase Pro $25 + Resend Pro $20 = +$65/月
  // → Commander に「Phase 1 到達: 投資意思決定をお願いします」通知
} else if (mrr < 10000) {
  phase = 2;
  // → 推奨投資: Claude Max $200 + Cloudflare Pro $20 + Sentry $26 = +$246/月
} else {
  phase = 3;
  // → 推奨投資: Cyber insurance + SOC 2 prep + US legal counsel = +$1,500/月
}
```

Phase が前日から変化した場合、Commander を通じて Shuraemon に「投資意思決定 requested」通知。

### 自動アラート閾値

```yaml
critical:            # 即時メール → Shuraemon
  mrr_daily_drop_pct: 10          # 前日比 10% 以上 MRR 減少
  active_sub_drop_24h: 2          # 24h で 2 件以上解約
  api_anthropic_monthly_pct: 80   # 月予算の 80% 到達
  error_rate_generate_pct: 5      # /api/generate エラー率 5% 超

warning:             # 次の Daily Brief に含める
  trial_conversion_weekly_pct: 10 # 週次 Trial→Pro 変換率 10% 未満
  churn_weekly_pct: 5             # 週次解約率 5% 超
  api_monthly_pct_95: 95          # 月予算 95% → 該当 API 一時停止オプション提示

info:                # Weekly Brief に含める
  new_pro_signup: true
  new_team_signup: true
  phase_change: true               # Phase 判定が変わった
```

### /goal テンプレート（Finance Agent 月次レポート）

```
/goal Finance Agentとして月次レポートを生成:

1. Supabase finance_snapshots から当月全データを取得
2. 以下を計算:
   - MRR（月末時点）/ 前月比
   - ARR
   - Gross Margin（平均）
   - Churn Rate（月次）
   - Trial→Pro 変換率
   - API コスト合計（Anthropic / Resend）
3. Phase 判定を実行（mrr に基づく）
4. agents/finance.md §6 のテンプレートに従いレポートを生成
5. obsidian-vault/YYYY-MM-finance-report.md に保存
6. Shuraemon に「Monthly Finance Report ready」と報告
```

### 30 日後 KPI 目標（保守 / Stretch）

| KPI | 保守 | Stretch |
|-----|------|---------|
| 有料顧客 | 15 社 | 30 社 |
| MRR | $750 | $1,500 |
| Trial 累計 | 100 | 250 |
| Trial→Pro 変換率 | 15% | 20% |
| Gross Margin | 90%+ | 95%+ |

---

## Escalation Contacts

- **Finance Lead:** [Email/Slack]
- **Stripe Support:** stripe.com/support
- **Accounting Advisor:** [Name/contact]
- **Emergency:** Page finance immediately

---

**Contact:** Slack #finance-team  
**Last Updated:** May 17, 2026  
**Next Checkpoint:** May 26, 2026 (Launch day monitoring)
