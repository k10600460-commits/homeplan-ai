# ⚖️ HomePlanAI Legal Agent

**Role:** Compliance, Regulatory & Risk Management  
**Sprint:** Step 8–9 (Pre-launch)  
**Deadline:** May 23, 2026 (3 days before launch)  
**Status:** In Progress

---

## Mission

Ensure HomePlanAI operates in compliance with all applicable laws and regulations before public launch. Mitigate legal risks, protect user data, and establish trust through transparent policies.

---

## Compliance Overview

**Jurisdictions:**
- Primary: **USA** (federal + state levels)
- Data protection: **GDPR** (if EU users), **CCPA** (California), **LGPD** (Brazil)
- Industry: **Real estate**, **Consumer Software**

**Regulations Applicable:**
- Consumer protection laws (FTC Act § 5)
- Payment processor compliance (PCI DSS via Stripe)
- Data privacy laws (GDPR, CCPA, etc.)
- Accessibility laws (WCAG, ADA)
- Intellectual property (IP ownership)

---

## Deliverables (Due May 23, 2026)

### 1. **Terms of Service (ToS)** 📄

**Document Outline:**

```
HomePlanAI Terms of Service

1. Acceptance of Terms
   - User must accept before using service
   - Changes to ToS require 30 days notice

2. Service Description
   - AI-powered home plan generation
   - PDF export with branding
   - Free tier: 3 plans/month
   - Pro tier: Unlimited plans, $49/month

3. User Eligibility
   - Must be 18+ years old
   - Must be authorized to represent business (builder/contractor)
   - Cannot use if in sanctioned countries (OFAC list)

4. Acceptable Use Policy
   PROHIBITED:
   ✗ Commercial resale of plans without permission
   ✗ Reverse engineering or scraping
   ✗ Illegal use (money laundering, sanctions evasion, etc.)
   ✗ Spam, harassment, abuse
   ✗ Malware, viruses, hacks
   
   ALLOWED:
   ✓ Personal use by builders/contractors
   ✓ Sharing plans with clients/prospects
   ✓ Commercial use for sales/marketing
   ✓ Feedback & feature requests

5. Intellectual Property
   - User-generated content (plans): Creator retains rights
   - HomePlanAI IP (UI, Claude API integration): Company retains rights
   - No license to modify, sublicense, or resell plans

6. Pricing & Billing
   - Free tier: 3 plans/month, auto-resets
   - Pro tier: $49/month, recurring, auto-renew
   - 14-day trial: No credit card required to cancel
   - All prices in USD
   - Stripe processes payments

7. Refund Policy
   - Refunds: Available within 30 days of purchase
   - Trial cancellation: Anytime, no penalty
   - Chargeback disputes: Handled by Stripe

8. Limitation of Liability
   - We provide "as is" without warranties
   - We're not liable for indirect damages (lost profit, etc.)
   - Liability capped at amount paid in past 12 months
   - We don't warrant accuracy of AI-generated plans

9. Disclaimers
   - Plans are conceptual only; require architect/engineer review
   - Not liable for building code violations
   - Plans may not be used for legal liability claims
   - [See disclaimer section below]

10. Termination
    - User can delete account anytime
    - Company can terminate for ToS violations
    - 30-day notice for account cleanup

11. Dispute Resolution
    - Governing law: [US State, e.g., California]
    - Arbitration (not court) required
    - No class actions permitted
    - Arbitration fees split equally

12. Miscellaneous
    - Entire agreement; supersedes prior agreements
    - Severability: Invalid sections don't void entire ToS
    - Assignment: Company can assign to acquirer
    - No third-party beneficiaries
```

**Key Clauses:**

```markdown
### Warranties Disclaimer

"THE SERVICE AND ALL CONTENT ARE PROVIDED 'AS IS' AND 'AS AVAILABLE' 
WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT 
LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR 
PURPOSE, OR NON-INFRINGEMENT.

WE DO NOT WARRANT THAT:
- Plans will comply with local building codes
- Plans will be accurate or complete
- Service will be error-free or uninterrupted
- AI-generated plans will meet your specifications

YOU ACKNOWLEDGE THAT AI-GENERATED HOME PLANS ARE FOR VISUALIZATION 
ONLY AND MUST BE REVIEWED BY A LICENSED ARCHITECT OR ENGINEER BEFORE 
USE IN CONSTRUCTION."
```

**Status:** Draft complete, ready for legal review ✓

---

### 2. **Privacy Policy** 🔒

**Document Outline:**

```
HomePlanAI Privacy Policy

1. Data Collection
   What we collect:
   - Account info: Email, name, sign-in method (GitHub OAuth)
   - Land data: Lot size, shape, utilities (user-provided)
   - Usage data: Plans generated, timestamps
   - Device data: IP address, browser, OS (analytics)
   - Payment data: Name, address (Stripe handles, we don't store)

2. How We Use Data
   - Generate home plans (core service)
   - Improve AI model (anonymized data)
   - Send transactional emails (billing, support)
   - Analytics (improve product)
   - Billing & subscription management
   - Fraud detection (payment processing)

3. Data Retention
   - Deleted accounts: 30-day grace period, then purged
   - Land data: Retained while generating plans
   - Payment data: Stripe retains per PCI DSS
   - Backups: 90-day retention (Supabase)

4. Sharing with Third Parties
   ✓ Stripe (payment processing)
   ✓ Anthropic (Claude API calls with anonymized data)
   ✓ Supabase (database hosting)
   ✓ Vercel (deployment/hosting)
   ✗ We do NOT sell data to advertisers or brokers

5. International Data Transfers
   - EU users: Standard Contractual Clauses (SCC)
   - Canada: PIPEDA compliant
   - Brazil: LGPD compliant
   - Australia: APPs compliant

6. User Rights (GDPR & CCPA)
   
   GDPR (EU users):
   - Right to access: Download your data (CSV)
   - Right to rectification: Update incorrect data
   - Right to erasure: "Right to be forgotten"
   - Right to restrict processing
   - Right to data portability
   - Right to object
   - Request deadline: 30 days
   
   CCPA (California residents):
   - Right to know: What data is collected
   - Right to delete: Request account deletion
   - Right to opt-out: Of data sales (we don't do this)
   - Request deadline: 45 days

7. Cookies & Tracking
   - Session cookies: Required for login
   - Analytics: Google Analytics (anonymous)
   - No third-party ads/tracking pixels
   - Users can opt-out of analytics

8. Data Security
   - HTTPS encryption for all data in transit
   - Database encryption at rest (Supabase)
   - Password hashing (bcrypt)
   - API key rotation (every 90 days)
   - No plaintext storage of sensitive data
   - Regular security audits (annual)

9. Contact & DPO
   - Privacy inquiries: privacy@homeplan-ai.com
   - Data Protection Officer: [If required by GDPR, scope out later]
   - Response SLA: 30 days for GDPR/CCPA requests

10. Policy Changes
    - We'll notify users 30 days before major changes
    - Continued use = acceptance of new policy
```

**GDPR Compliance Checklist:**

```
For EU users accessing the app:
- [ ] Consent banner (must opt-in to analytics)
- [ ] Privacy policy link in footer
- [ ] Legitimate interest assessment (LIA)
- [ ] Data Processing Agreement (DPA) with Supabase
- [ ] Data Processing Agreement with Stripe
- [ ] Breach notification protocol (notify within 72 hours)
- [ ] DPIA (Data Protection Impact Assessment) if risk
```

**Status:** Draft complete, needs legal review for GDPR adequacy ⚠️

---

### 3. **Data Processing Agreement (DPA)** 📋

**With Supabase (Database Provider):**

**Key Clauses:**
```
1. Processor Role: Supabase acts as data processor
2. Data types: User accounts, land specs, usage logs
3. Processing purposes: Storage, backup, analytics
4. Sub-processors: Supabase uses AWS (disclose to users)
5. Security: Encryption at rest, TLS in transit
6. Location: [US-based server location]
7. Term: Concurrent with ToS
8. Termination: Data deleted per privacy policy
9. Compliance: GDPR Art. 28, CCPA § 1798.140(ae)
```

**Status:** Supabase's standard DPA covers this ✓

**With Stripe (Payment Processor):**

**Key Clauses:**
```
1. Processor Role: Stripe processes payment data
2. Data types: Name, email, billing address, card (tokenized)
3. Security: PCI DSS Level 1 compliant
4. Scope: Stripe doesn't handle home plan data
5. Compliance: Stripe's standard DPA
```

**Status:** Stripe's standard DPA adequate ✓

**With Anthropic (Claude API):**

**Key Clauses:**
```
1. Processor Role: Anthropic processes anonymized land data
2. Data types: Lot size, utilities, roof type (no PII)
3. Purpose: Generate home plans
4. Retention: Deleted after API response
5. Model training: Anthropic may use for improving Claude
6. Compliance: Need to confirm Anthropic's GDPR compliance
```

**Status:** Need to clarify with Anthropic ⚠️

---

### 4. **IP Ownership & Licensing** ⚖️

**Intellectual Property Matrix:**

| Item | Owner | License | Notes |
|------|-------|---------|-------|
| HomePlanAI UI/Code | Company | Proprietary | Developers hired for company |
| Claude API | Anthropic | License | Used via API; not owned |
| User-generated plans | User | Creator rights | User can modify/share |
| Company logo/branding | Company | Proprietary | Registered trademark (future) |
| Documentation | Company | CC-BY (public) | Open for reference |

**Developer Assignment of Invention (if contractors used):**
```
[CONTRACTOR] hereby assigns all work product created 
while performing services to HomePlanAI, Inc. This includes 
code, designs, documentation, and inventions.

Exception: Contractor retains pre-existing IP brought to project.

Term: Extends 2 years post-termination for work done in scope.
```

**Status:** Need to execute assignments with contractors ⚠️

---

### 5. **Stripe Compliance Checklist** 🔐

**PCI DSS Compliance (Payment Card Industry):**

```
✓ Never store full credit card numbers → Stripe handles
✓ Use Stripe checkout → Tokenization
✓ HTTPS encryption → Vercel provides SSL
✓ Fraud detection → Stripe Radar
✓ Audit logs → Stripe dashboard
✓ Compliance docs → Stripe provides attestation
```

**Stripe Requirements:**
- [ ] Terms of Service reference Stripe's
- [ ] Privacy Policy discloses Stripe as processor
- [ ] No cardholder data stored in Supabase
- [ ] Webhook validation (verify Stripe signature)
- [ ] Webhook logs retained for disputes

**Status:** Mostly compliant; webhook validation critical ✓

---

### 6. **GDPR Consent Flow** 🔓

**Implementation in App:**

```
Landing Page:
┌─────────────────────────────────────────┐
│  Privacy Banner (bottom of page)         │
│  "We use cookies for analytics."         │
│  [ACCEPT] [REJECT] [LEARN MORE]         │
└─────────────────────────────────────────┘

If ACCEPT:
- Set cookie: consent_analytics = true
- Load Google Analytics

If REJECT:
- Don't load GA
- Set cookie: consent_analytics = false

LEARN MORE:
- Link to full Privacy Policy

Sign-Up Page:
┌─────────────────────────────────────────┐
│  Checkbox: ☐ I agree to Terms & Privacy │
│  Checkbox: ☐ Subscribe to email updates │
│  [Continue]                             │
└─────────────────────────────────────────┘
```

**Cookie Inventory:**

| Cookie | Purpose | Expires | Required |
|--------|---------|---------|----------|
| `session_id` | Login session | 30 days | ✓ (functional) |
| `_ga` | Google Analytics | 2 years | ✗ (analytics—can reject) |
| `consent_analytics` | Track consent | 1 year | ✓ (necessary) |

**Status:** Need to implement banner in frontend ⚠️

---

### 7. **Accessibility Audit (WCAG 2.1 AA)** ♿

**Standard:** WCAG 2.1 Level AA (industry standard for web apps)

**Testing Checklist:**

```
1. Keyboard Navigation
   - [ ] All buttons/links accessible via Tab key
   - [ ] Escape key closes modals
   - [ ] Focus visible on all interactive elements
   - [ ] Form fields properly labeled

2. Screen Reader Support
   - [ ] ARIA labels present on custom components
   - [ ] Semantic HTML (buttons, forms, headings)
   - [ ] Images have alt text
   - [ ] Tables have headers

3. Color & Contrast
   - [ ] Text contrast ≥ 4.5:1 for normal text
   - [ ] Color not sole indicator (e.g., red error message also has 🚨)
   - [ ] No seizure-inducing flashes (≥3/second)

4. Responsiveness
   - [ ] Mobile: Buttons ≥ 44x44px (touch target)
   - [ ] Zoom: Works up to 200%
   - [ ] Orientation: Landscape + portrait work

5. Forms & Labels
   - [ ] Form labels associated with fields
   - [ ] Error messages clear & linked to fields
   - [ ] Submit button clearly labeled

6. Media
   - [ ] Videos have captions
   - [ ] Images have alt text
   - [ ] Audio alternatives provided (transcript)

7. Navigation
   - [ ] Skip links present (skip to main content)
   - [ ] Breadcrumbs or clear back navigation
   - [ ] Current page indicated

8. Language
   - [ ] Page language specified (HTML lang="en")
   - [ ] Complex terms defined
   - [ ] Reading level accessible (avoid jargon)
```

**Testing Tools:**
- axe DevTools (browser extension)
- WAVE (webaim.org)
- Lighthouse (DevTools)
- Screen reader: VoiceOver (Mac), Narrator (Windows)

**Status:** Need to run audit before launch ⚠️

---

### 8. **Risk Register** 📋

**Severity:** High (🔴) | Medium (🟡) | Low (🟢)

| Risk | Severity | Mitigation | Owner |
|------|----------|-----------|-------|
| AI-generated plans inaccurate, builder uses for real construction | 🔴 | Disclaimer in ToS + PDF footer "FOR VISUALIZATION ONLY" | Legal |
| GDPR complaint from EU user (data not deleted on request) | 🔴 | Automated GDPR request handler, 30-day SLA | Dev + Legal |
| Payment dispute (user claims unauthorized charge) | 🟡 | Stripe dispute resolution, proof of consent | Finance |
| Stripe terminates account (fraud risk) | 🔴 | Comply with all rules, monitor for abuse, strong KYC | Finance |
| Competitor claims IP infringement | 🟡 | Ensure Claude API usage complies with Anthropic ToS | Legal |
| Accessibility lawsuit (user can't use app) | 🟡 | WCAG 2.1 AA audit, fix before launch | Dev |
| Data breach (hacker accesses Supabase) | 🔴 | Encryption, regular audits, breach notification plan | Dev + Legal |
| Negative press/reputation risk | 🟡 | Transparent communication, fast response to issues | Sales + Legal |
| Tax audit (sales tax not collected) | 🟡 | Consult accountant, collect tax where required | Finance + Legal |

**Escalation Process:**
- P0 (Critical): Alert CEO immediately, page legal team
- P1 (High): Legal team review within 24h
- P2 (Medium): Weekly review

---

### 9. **Pre-Launch Legal Checklist** ✅

- [ ] Terms of Service finalized & linked in footer
- [ ] Privacy Policy published & GDPR-compliant
- [ ] Data Processing Agreements signed (Supabase, Stripe)
- [ ] Developer IP assignments executed (if contractors)
- [ ] Stripe compliance verified (webhook validation live)
- [ ] GDPR consent banner implemented
- [ ] Accessibility audit completed (WCAG AA)
- [ ] Disclaimer in PDF footer: "FOR VISUALIZATION ONLY"
- [ ] Risk register reviewed with team
- [ ] Insurance quote obtained (E&O, cyber liability)
- [ ] Registered business entity (LLC/C-Corp)
- [ ] Contracts with third parties reviewed

---

### 10. **Post-Launch Monitoring** 🔄

**Quarterly Reviews:**
- GDPR complaint log
- Payment disputes
- Security incidents
- Accessibility complaints
- Regulatory updates (new laws)

**Annual Reviews:**
- Update ToS/Privacy Policy
- Audit DPAs with vendors
- Accessibility re-audit
- Insurance renewal

---

## Legal Team Contacts

- **General Counsel:** [Name/Email]
- **IP Attorney:** [Name/Email]
- **Compliance Advisor:** [Name/Email]
- **Insurance Broker:** [Name/Email]

**Escalation:** Slack #legal-team

---

## Compliance Timeline

```
May 17, 2026 | Drafts completed
May 20, 2026 | Internal legal review
May 21, 2026 | External counsel review (if budget allows)
May 22, 2026 | Final edits & publication
May 23, 2026 | ✓ All docs live, audit complete, sign-off
May 26, 2026 | 🚀 LAUNCH
```

---

**Status:** On track for May 23 deadline  
**Last Updated:** May 17, 2026  
**Next Review:** May 20, 2026 (Internal checkpoint)
