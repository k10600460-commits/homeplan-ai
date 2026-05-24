# Team プラン無制限化 変更スコープ調査

**実施日**: 2026-05-24  
**調査範囲**: `src/lib/usage.ts`, `src/app/api/generate/route.ts`, `src/app/api/usage/route.ts`, `src/app/dashboard/DashboardClient.tsx`, `src/app/results/page.tsx`, `src/app/upgrade/page.tsx`, `src/app/page.tsx`, `src/lib/emails.ts`  
**方針**: 調査・見積もり・記録のみ。コード変更なし。

---

## 結論（TL;DR）

**複雑度: 小（最小変更）**

`src/lib/usage.ts:12` の **1 行変更**（`100` → `9999`）だけで実装できる。  
フロントエンド表示の破綻なし。TypeScript 型変更なし。  
ローンチ 2 日前に入れる場合のリグレッションリスクは **低**。

---

## 1. 上限判定の仕組みと最小変更の特定

### `checkUsageLimit()` の動作（`src/lib/usage.ts:67-85`）

```ts
export async function checkUsageLimit(userId: string) {
  const [plan, usage] = await Promise.all([getUserPlan(userId), getMonthlyUsage(userId)])
  const limit     = PLAN_LIMITS[plan].requestsPerMonth   // 現在: team → 100
  const current   = usage.requestCount
  const remaining = Math.max(0, limit - current)
  return { allowed: current < limit, plan, current, limit, remaining }
}
```

**判定ロジック**: `allowed = current < limit`  
→ Team の `limit` を大きくするだけで素通りする。

### PLAN_LIMITS 定義（`src/lib/usage.ts:9-13`）

```ts
export const PLAN_LIMITS = {
  free: { requestsPerMonth: 3,   label: 'Free Plan' },
  pro:  { requestsPerMonth: 100, label: 'Pro Plan ($49/mo)' },
  team: { requestsPerMonth: 100, label: 'Team Plan ($149/mo)' },  // ← ここだけ変更
} as const
```

### 実装オプション比較

| オプション | 内容 | 評価 |
|-----------|------|------|
| **A: 番兵値 9999** | `team.requestsPerMonth: 9999` に変更 | ✅ 採用推奨 |
| B: Infinity | `checkUsageLimit()` に Team 分岐追加し `limit: Infinity` を返す | ❌ 不採用 |
| C: null / undefined | Team は limit チェックをスキップ | ❌ 不採用 |

**Option B を採用しない理由**:  
`JSON.stringify(Infinity)` は `null` に変換される（JSON 仕様）。`/api/usage` や `/api/generate` のレスポンスに `"limit": null` が混入し、フロントエンドで `Number(null) = 0` → ゼロ除算が発生する恐れがある。

**Option A（9999）を採用する理由**:
- `Math.max(0, 9999 - current)` → 通常の整数演算。問題なし
- `JSON.stringify({ limit: 9999 })` → `"limit":9999`。問題なし
- TypeScript `as const` の型は `9999` リテラルになるが、呼び出し側は `number` 型として扱うため互換
- Team の月上限が実質 9999 回（$329.97/ユーザー/月）は運用上の安全圏（Anthropic spend limit $200/月でハード上限がある）

---

## 2. 変更ファイル一覧

### 🔴 必須変更（機能実装）

| ファイル | 行 | 変更前 | 変更後 |
|---------|---|--------|--------|
| `src/lib/usage.ts:12` | `team: { requestsPerMonth: 100, ...}` | `team: { requestsPerMonth: 9999, ...}` |

**これ 1 行のみ。** 以下はすべて「変更不要」と確認した。

---

### ✅ 変更不要と確認した箇所

#### `src/app/api/generate/route.ts:86-96` — 上限超過 HTTP 429

```ts
if (!usageCheck.allowed) {
  return NextResponse.json(
    { error: "Monthly limit reached", code: "LIMIT_EXCEEDED",
      plan: usageCheck.plan, current: usageCheck.current, limit: usageCheck.limit },
    { status: 429 },
  );
}
```

Team が 9999 になれば `allowed` が常に `true` → このブロックに到達しない。問題なし。

#### `src/app/api/generate/route.ts:157-166` — レスポンスの `usage.remaining`

```ts
return NextResponse.json({
  plans: data.plans,
  usage: { ..., remaining: usageCheck.remaining - 1, limit: usageCheck.limit },
});
```

`remaining: 9999 - N - 1` → 大きな正の数。フロント（`/results` にリダイレクト）はこの値を表示に使っていないので問題なし。

#### `src/app/page.tsx:472-473` — LIMIT_EXCEEDED 時の `/upgrade` リダイレクト

```ts
router.push(`/upgrade?current=${data.current}&limit=${data.limit}&plan=${data.plan}`);
```

Team が 9999 なら LIMIT_EXCEEDED が発生しないため、このパスに到達しない。問題なし。

#### `src/app/upgrade/page.tsx:24-26` — プログレスバー

```ts
const limit = Number(searchParams.get("limit") ?? 5);
// style={{ width: `${Math.min(100, (current / limit) * 100)}%` }}
```

Team はこのページに到達しない。もし何らかの理由で到達しても `(current / 9999) * 100 ≈ 0%` になる（バーがほぼ空になる）だけで、クラッシュしない。

#### `src/app/api/usage/route.ts` — GET `/api/usage`

```ts
const usage = await checkUsageLimit(user.id)
return NextResponse.json(usage)
```

`checkUsageLimit()` の結果をそのまま返す薄いラッパー。**フロントエンドからの呼び出し元は現在ゼロ**（grep で `/api/usage` の fetch 箇所がフロントエンドに存在しない）。将来用エンドポイントと判断。問題なし。

#### `src/app/dashboard/DashboardClient.tsx` — 表示への影響なし

| 行 | 内容 | Team への影響 |
|----|------|-------------|
| 447–449 | `Free plan: up to 3 generations/month` | `!subscription?.isActive` の内側 → Team には非表示 |
| 669 | `{N}/14 slots used` | メンバースロット数（生成上限ではない） |
| 707 | `{m.planCount} plans this month` | メンバーごとのカウント表示（DB から独立して取得） |
| 735 | `Unlimited generations · ... $49/mo` | Free → Pro CTA（`userPlan === "free"` の内側） |

**ダッシュボードに「X/100 生成済み」のような使用量バーは存在しない。** 全て問題なし。

#### `src/app/results/page.tsx:883` — 警告バナー

```tsx
{(neighborhood?.nearingLimit || market?.nearingLimit) && (...)}
```

`nearingLimit` は Google Maps / RentCast の外部 API 上限（`api_usage_external` テーブル）であり、生成回数上限とは無関係。問題なし。

#### `src/lib/emails.ts` — メール文言

行 23, 38, 77, 102 に "unlimited plans" / "Unlimited AI floor plan generations" の記述があるが、上限数値（100 等）を動的に埋め込む箇所はない。問題なし。

---

## 3. カウンタと上限判定の分離確認

`recordApiUsage()` (`usage.ts:88-106`) と `checkUsageLimit()` (`usage.ts:68-85`) は完全に独立している。

```
[generate] checkUsageLimit() → 上限チェック（allowed を見る）
[generate] client.messages.create() → Claude API 呼び出し
[generate] recordApiUsage() → api_usage テーブルに記録（non-blocking）
```

9999 番兵値にしても **Team のカウンタは増え続ける**（分析・コスト追跡目的で正常動作）。  
上限「判定」と使用「記録」が分離されているため、記録ロジックの変更は不要。

---

## 4. 型・エッジケース確認

| 操作 | 9999 での結果 | 問題 |
|------|-------------|------|
| `Math.max(0, 9999 - current)` | 正の整数 | なし |
| `Math.min(100, (current / 9999) * 100)` | ≈ 0.01% | なし（Upgrade ページには到達しない） |
| `JSON.stringify({ limit: 9999 })` | `"limit":9999` | なし |
| TypeScript `as const` | `9999` リテラル型 | なし（呼び出し側は `number` 型） |
| `current < 9999` で Infinity 比較 | 発生しない | なし |

---

## 5. マーケティング・法務（別タスク・コード変更対象外）

| 箇所 | 現在の表記 | 必要な対応 |
|------|----------|----------|
| `src/app/page.tsx:90` | Team: `"Everything in Pro"` | LP 上 "Unlimited" 継承 → 整合 |
| `src/app/terms/page.tsx` | Team 生成数の明示的記載なし | Terms で Team を "Unlimited" と明記するなら追記 |

Terms の fair use 条項追記等は別タスク（コンテンツ側）として対応すること。

---

## 6. 変更ファイル一覧（最終）

| ファイル | 行 | 変更種別 | 内容 |
|---------|---|---------|------|
| `src/lib/usage.ts:12` | 1行修正 | 🔴 必須 | `requestsPerMonth: 100` → `requestsPerMonth: 9999` |

**合計 1 ファイル・1 行の変更。**

---

## 7. 工数・複雑度・リスク評価

| 項目 | 評価 |
|------|------|
| **複雑度** | **小** — 1行変更、型変更なし、フロント変更なし |
| **実装工数** | 5分以内 |
| **テスト工数** | 30〜60分（DB 手動操作が必要） |
| **リグレッションリスク** | **低** — 変更箇所が PLAN_LIMITS の値のみ。Free/Pro の動作に無影響。 |

---

## 8. テスト項目（ローンチ前に入れる場合）

| # | テスト | 方法 | 期待結果 |
|---|--------|------|---------|
| 1 | Team: 上限突破後も生成できるか | Supabase で `api_usage.request_count` を 101 に手動 UPDATE → 生成実行 | HTTP 200 で生成成功 |
| 2 | Free: 3回上限が維持されているか | Free ユーザーで 4回目の生成を試みる | HTTP 429 + `/upgrade` リダイレクト |
| 3 | Pro: 100回上限が維持されているか | Pro ユーザーの `request_count` を 100 に手動 UPDATE → 生成実行 | HTTP 429 + `/upgrade` リダイレクト |
| 4 | Team: カウンタが増え続けるか | 生成後に `api_usage` テーブルを確認 | `request_count` が増加している |

---

## 参照

- `src/lib/usage.ts:9-13` — `PLAN_LIMITS` 定義・変更対象
- `src/lib/usage.ts:67-85` — `checkUsageLimit()` ロジック
- `src/app/api/generate/route.ts:84-97` — 上限チェック → 429 分岐
- `src/app/api/generate/route.ts:146-148` — `recordApiUsage()` 呼び出し（記録は独立）
- `docs/launch/plan-usage-limits-audit-20260524.md` — 生成上限詳細監査
- `docs/launch/api-cost-surface-audit-20260524.md` — Anthropic コスト試算（9999回は spend limit $200 でハード制限される）
