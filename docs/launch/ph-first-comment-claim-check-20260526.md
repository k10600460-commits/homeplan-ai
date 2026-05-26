# PH First Comment — 主張の実装整合性チェック — 2026-05-26

検証対象: `obsidian-vault/launch-first-comment.md` の確定版ドラフト

---

## 検証1: 「Free tier, no login required to try」

### 判定: **不正確（誇張）**

### 根拠

**`src/app/api/generate/route.ts:75–81`**
```ts
// ── Auth check ─────────────────────────────────────
const supabase = await createClient();
const { data: { user } } = await supabase.auth.getUser();

if (!user) {
  return NextResponse.json({ error: "Unauthorized", code: "UNAUTHENTICATED" }, { status: 401 });
}
```
認証済みセッションがない場合、`/api/generate` は即座に 401 を返す。

**`src/app/page.tsx:471`**
```ts
if (res.status === 401) { router.push("/login"); return; }
```
クライアントは 401 を受け取ると `/login` にリダイレクトする。

**`src/app/page.tsx:37`**
```ts
signupNote: "✨ Quick signup to receive your plans · No credit card required",
```
フォーム上部に「サインアップが必要」と明記されている。

### 実際のフロー
1. LP のフォームに入力
2. 「Generate Plans」を送信 → `/api/generate` を呼ぶ
3. 未ログインの場合 → 401 → `/login` へリダイレクト
4. **メール + パスワードでアカウント作成（サインアップ必須）**
5. メール確認後 → 3回まで無料生成可能

### 正確な言い回し（代案）
```
- Free tier: 3 floor plans free · No credit card required (quick signup)
```
または:
```
- Free tier · Quick signup, no credit card needed
```

---

## 検証2: 「Track when they open it, what plan they linger on, when they're ready to talk」

### 判定: **部分的に不正確（"linger on" と "when they're ready to talk" は誇張）**

### 根拠 — 記録されるイベント種別

**`src/app/api/share/event/route.ts:5`**
```ts
const ALLOWED_EVENTS = ['view', 'pdf_download', 'plan_selected'] as const
```

| イベント | 何を意味するか | plan特定 |
|---|---|---|
| `view` | リンクをページ開封（マウント時） | なし |
| `plan_selected` | プランカードをクリック/展開した | `planIndex` あり |
| `pdf_download` | PDF をダウンロードした | `planIndex` あり（単体DL時） |

**`src/app/s/[slug]/SharePortalClient.tsx:311–316`** (view)
```ts
useEffect(() => {
  fetch("/api/share/event", {
    ..., body: JSON.stringify({ slug, eventType: "view" }),
  }).catch(() => {});
}, [slug]);
```

**`src/app/s/[slug]/SharePortalClient.tsx:367–376`** (plan_selected)
```ts
function handlePlanExpand(planId: number) {
  setSelectedPlan(selectedPlan === planId ? null : planId);
  if (selectedPlan !== planId) {
    fetch("/api/share/event", {
      ..., body: JSON.stringify({ slug, eventType: "plan_selected", planIndex: planId - 1 }),
    }).catch(() => {});
  }
}
```

### 各フレーズの判定

| フレーズ | 判定 | 実態 |
|---|---|---|
| "Track when they open it" | ✅ **正確** | `view` イベント（マウント時）で開封を記録 |
| "what plan they linger on" | ⚠️ **部分的に不正確** | クリックして展開したプラン（`plan_selected`）は分かる。ただし「linger」（滞在時間・dwell time）は**一切計測していない**。時間ではなく「クリック」イベント |
| "when they're ready to talk" | ❌ **実装なし** | 該当するイベント・シグナルは存在しない |

### 正確な言い回し（代案）

```
Send to clients. See when they open it, which plan they click on, and if they download the PDF.
```
または:
```
See when they open it and which plan catches their attention.
```

---

## サマリー

| 主張 | 判定 | 修正要否 |
|---|---|---|
| "no login required to try" | 不正確（サインアップ必須） | **要修正** |
| "what plan they linger on" | 誇張（クリックは取れるが時間は取れない） | **要修正** |
| "when they're ready to talk" | 実装なし | **要削除** |
| "Track when they open it" | 正確 | 変更不要 |

---

## 修正後の推奨文面（該当箇所のみ）

変更前:
```
Send to clients. Track when they open it, what plan they linger on, when they're ready to talk.
```

変更後(案A — シンプル):
```
Send to clients. See when they open it and which plan they click on.
```

変更後(案B — 具体的):
```
Send to clients. Get notified when they open it — and see which plan they expand.
```

変更前:
```
- Free tier, no login required to try
```

変更後:
```
- Free tier · Quick signup, no credit card required
```
