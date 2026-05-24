# Apple Pay ドメイン認証 — 事前チェックレポート

**実施日**: 2026-05-24  
**対象**: OI-002 Apple Pay ドメイン認証の準備確認  
**凡例**: ✅ 問題なし / 📋 報告のみ（手作業待ち）

---

## 検証結果

### 1. middleware.ts — `.well-known/*` のインターセプト有無

**ファイル**: `src/middleware.ts`

```ts
export const config = {
  matcher: ["/dashboard/:path*", "/login"],
};
```

**判定: ✅**

- matcher は `/dashboard/*` と `/login` のみ。`/.well-known/*` は対象外。
- 認証ロジック（getUser() / redirect）は matcher にマッチしたパスのみ実行される。
- `/.well-known/apple-developer-merchantid-domain-association` は middleware を完全スルー。
- 修正不要。

---

### 2. vercel.json — redirects / rewrites / headers

**判定: ✅**

- `vercel.json` には `crons` 設定のみ。`redirects` / `rewrites` / `headers` キーなし。
- `.well-known/*` に影響するエントリなし。

---

### 3. next.config.ts — redirects / headers

**判定: ✅**

- `redirects()`: `/sign-up` 系5パターンのみ。`/.well-known/*` に関係なし。
- `headers()`: `source: "/(.*)"` で全パスにセキュリティヘッダー（X-Frame-Options 等）を付与するが、
  これは認証・リダイレクトではなくレスポンスヘッダーの追加のみ。
  Stripe の Apple Pay ドメイン認証（HTTP 200 + ファイル内容確認）に影響しない。

---

### 4. 認証ファイルの配置状況

**判定: 📋 前提の手作業が未完了**

```
public/.well-known/
└── .gitkeep   ← ディレクトリを git 追跡するためのプレースホルダーのみ
```

`apple-developer-merchantid-domain-association`（拡張子なし）は**存在しない**。

Stripe Dashboard からのダウンロード・配置が必要。

---

### 5. Next.js の `public/` 静的配信

**判定: ✅**

Next.js はデフォルトで `public/` 配下を `https://splanai.com/` 直下で静的配信する。
ファイルを `public/.well-known/apple-developer-merchantid-domain-association` に配置すれば
`https://splanai.com/.well-known/apple-developer-merchantid-domain-association` で HTTP 200 配信される。
追加設定不要。

---

### 6. git 追跡・.gitignore

**判定: ✅**

- `public/.well-known/` ディレクトリは `.gitkeep` で git 追跡済み（`git ls-files` 確認）。
- `.gitignore` に `.well-known` 関連の除外なし。
- 認証ファイルを配置して `git add` すれば自動的に追跡対象になる。

---

## 残タスク（手作業）

| ステップ | 担当 | 内容 |
|----------|------|------|
| 1 | Shoji（手作業） | Stripe Dashboard → Settings → Payment methods → Apple Pay → "Add new domain: splanai.com" → ファイル DL |
| 2 | Claude Code | `public/.well-known/apple-developer-merchantid-domain-association`（拡張子なし）として配置 → git add → commit → push |
| 3 | Shoji（手作業） | Vercel デプロイ確認後、Stripe Dashboard で "Verify" を押下 |

> ⚠️ ファイル名に `.txt` 等の拡張子が付いた状態で配置しないこと。
> Stripe は拡張子なしのファイル名で検証する。

---

## まとめ

インフラ側（middleware / vercel.json / next.config / Next.js 配信）は**すべて問題なし**。
`.well-known/*` が認証・リダイレクトなしで HTTP 200 公開される構成が確認できた。
認証ファイル自体が未配置のため、Shoji による Stripe DL → 配置 → Commit → Verify が次のアクション。
