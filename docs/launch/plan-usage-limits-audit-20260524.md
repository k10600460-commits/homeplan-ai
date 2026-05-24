# SplanAI プラン別生成上限 監査レポート

**実施日**: 2026-05-24  
**調査範囲**: `src/lib/usage.ts`, `src/app/api/generate/route.ts`, `src/app/page.tsx`, `src/app/terms/page.tsx`, `src/app/dashboard/DashboardClient.tsx`, `src/app/results/page.tsx`, `src/app/api/neighborhood/route.ts`  
**方針**: 調査・記録のみ。コード変更なし。

---

## 結論（TL;DR）

| プラン | コード上の上限 | マーケティング表記 | 乖離 |
|--------|-------------|-----------------|------|
| Free ($0) | **3回/月** | "3 floor plan generations / month" | ✅ 一致 |
| Pro ($49/月) | **100回/月** | **"Unlimited floor plan generations"** | ⚠️ **不一致** |
| Team ($149/月) | **100回/月** | "Everything in Pro" → 暗黙的に Unlimited | ⚠️ **不一致** |

**有料プランの生成上限: 100回/月（上限あり）**  
1ユーザーの最大 API コスト: 100回 × $0.033 ≈ **$3.30/月/ユーザー**

---

## 1. プラン設定の実装（コード）

### 定義箇所

**`src/lib/usage.ts:9-13`**

```ts
export const PLAN_LIMITS = {
  free: { requestsPerMonth: 3,   label: 'Free Plan' },
  pro:  { requestsPerMonth: 100, label: 'Pro Plan ($49/mo)' },
  team: { requestsPerMonth: 100, label: 'Team Plan ($149/mo)' },
} as const
```

- 期間: **月単位**（`getCurrentMonth()` で `YYYY-MM` を使用）
- 単位: **1リクエスト = 1回の間取り生成 = 1回の Claude API 呼び出し**

### checkUsageLimit() の実装

**`src/lib/usage.ts:68-85`**

```ts
export async function checkUsageLimit(userId: string): Promise<{ allowed, plan, current, limit, remaining }> {
  const [plan, usage] = await Promise.all([getUserPlan(userId), getMonthlyUsage(userId)])
  const limit     = PLAN_LIMITS[plan].requestsPerMonth   // 3 / 100 / 100
  const current   = usage.requestCount                   // api_usage テーブルから
  const remaining = Math.max(0, limit - current)
  return { allowed: current < limit, ... }
}
```

- Supabase の `api_usage` テーブルから当月の `request_count` を読む
- `current < limit`（厳密な `<`）: limit ちょうどで LIMIT_EXCEEDED になる
  - Free: 3回消費後に blocked（3回 < 3 が false）
  - Pro/Team: 100回消費後に blocked

---

## 2. プラン別一覧（価格・上限・最大コスト）

| プラン | 価格 | 上限 | 期間 | 最大 Anthropic コスト/月 |
|--------|------|------|------|------------------------|
| Free | $0 | 3回 | 月次リセット | $0.10（無料枠内） |
| Pro | $49/月 | **100回** | 月次リセット | **≈ $3.30/ユーザー** |
| Team | $149/月 | **100回** | 月次リセット | **≈ $3.30/ユーザー（5〜15人×100回=最大$49.5/月）** |

Team プランは 5〜15 人がそれぞれ 100 回使える設計。最大 1,500 回 × $0.033 ≈ **$49.5/月**。

---

## 3. 上限到達時の挙動

### API 側（generate/route.ts:86-95）

```ts
if (!usageCheck.allowed) {
  return NextResponse.json(
    { error: "Monthly limit reached", code: "LIMIT_EXCEEDED",
      plan: usageCheck.plan, current: usageCheck.current, limit: usageCheck.limit },
    { status: 429 },
  );
}
```

- HTTP 429 を返す
- 追加課金はなし（pure ブロック）
- Claude API には到達しない

### フロントエンド側（page.tsx:473）

```ts
router.push(`/upgrade?current=${data.current}&limit=${data.limit}&plan=${data.plan}`);
```

- `/upgrade` ページへリダイレクト（アップセル導線）
- Pro ユーザーが 100 回到達した場合も `/upgrade` に飛ぶ（Team プランの提案になる）

---

## 4. マーケティング表記とコードの乖離

### LP（src/app/page.tsx:89）

```ts
pro: { features: ["Unlimited floor plan generations", "Branded PDF...", ...] }
```

### Terms of Service（src/app/terms/page.tsx:70）

```
Pro — Unlimited generations, branded PDF export, neighborhood & market data…
```

### Dashboard（src/app/dashboard/DashboardClient.tsx:732,735）

```tsx
<h2>Unlock unlimited plans</h2>
<p>Unlimited generations · Branded PDF · Neighborhood data · $49/mo</p>
```

**実態**: コードは 100回/月 で厳密にブロック。"Unlimited" は**虚偽表示**になる可能性がある。

### 評価

| 箇所 | 表記 | コード実態 | 問題 |
|------|------|----------|------|
| LP Pro features | "Unlimited floor plan generations" | 100回/月 | ⚠️ 乖離 |
| Terms Pro description | "Unlimited generations" | 100回/月 | ⚠️ 乖離（法的リスクが高い） |
| Dashboard CTA | "Unlimited generations · $49/mo" | 100回/月 | ⚠️ 乖離 |
| Dashboard Free section | "Free plan: up to 3 generations/month" | 3回/月 | ✅ 一致 |

**修正方針（提案・決定は Shoji）**:  
(A) コードを「実質無制限（例: 9,999回）」に変更 → "Unlimited" 表記を維持  
(B) マーケティング表記を "100 generations/month" に修正 → コードと一致させる  
どちらかで対処が必要。ローンチ前に選択することを推奨。

---

## 5. /neighborhood が生成と連動するか

### 結論: **独立した操作（生成回数にカウントされない）**

### 呼び出し箇所

**`src/app/results/page.tsx:494〜525`**（`useEffect`内）

```ts
useEffect(() => {
  // sessionStorage から formData / selectedLocation を読む
  const storedLocation = sessionStorage.getItem("selectedLocation");
  if (storedLocation) {
    const loc = JSON.parse(storedLocation);
    fetch(`/api/neighborhood?city=${encodeURIComponent(loc.city)}&state=${...}`)
      .then(data => { setNeighborhood(...); setMarket(...); })
  }
}, []);  // 結果ページマウント時に1回だけ
```

- `/api/generate` の内部では呼ばれていない
- 結果ページ（`/results`）を表示した時点で1回だけ発火
- city / state を入力していない場合は呼ばれない

### プランゲート

**`src/app/api/neighborhood/route.ts:113-114`**

```ts
const { data: { user } } = await supabase.auth.getUser()
if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
```

- **プランチェックなし** — Free ユーザーも認証さえ通れば近隣データを取得できる
- LP では "Neighborhood & market data" を Pro 機能として記載しているが、コード上は Free でも利用可能
- 独立した月間カウント制限あり（`api_usage_external`: stop=28,000 Google Maps / stop=50 RentCast）

---

## 6. 各プランの機能境界まとめ（コードベース）

| 機能 | Free | Pro | Team |
|------|------|-----|------|
| 間取り生成 | **3回/月** | **100回/月** | **100回/月** |
| PDF 出力 | SplanAI ブランド | ロゴ入り | 白ラベル（SplanAI ロゴなし） |
| 近隣データ（Google Maps / RentCast） | ✅（コード上制限なし） | ✅ | ✅ |
| 顧客共有リンク | ✅ | ✅ | ✅ |
| MLS 連携（Trestle） | ❌ | ✅ | ✅ |
| チームメンバー管理 | ❌ | ❌ | ✅（5〜15人） |

---

## 7. ローンチ前の推奨アクション

| 優先度 | 対象 | 内容 |
|--------|------|------|
| 🔴 ローンチ前推奨 | コード or マーケティング | Pro/Team "Unlimited" ↔ 100回/月 の乖離解消 |
| 🟡 post-launch | neighborhood route | Free ユーザーへのゲートが LP 表記と不一致（軽微、実害は限定的） |

---

## 参照

- `src/lib/usage.ts` — `PLAN_LIMITS` 定義・`checkUsageLimit()`
- `src/app/api/generate/route.ts` — 生成エンドポイント・LIMIT_EXCEEDED 処理
- `src/app/page.tsx:88-90` — LP プラン機能一覧
- `src/app/terms/page.tsx:69-71` — Terms プラン説明
- `src/app/dashboard/DashboardClient.tsx:732,735` — Dashboard CTA 文言
- `src/app/results/page.tsx:494-525` — neighborhood fetch トリガー
- `src/app/api/neighborhood/route.ts:113` — プランゲートなし確認
- `docs/launch/api-cost-surface-audit-20260524.md` — API コスト全体像（本文書と対）
