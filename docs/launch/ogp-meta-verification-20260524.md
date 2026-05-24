# OGP・メタタグ検証レポート

**実施日**: 2026-05-24  
**対象**: splanai.com ローンチ前 OGP・メタタグ検証（OI-011 の一部）  
**凡例**: ✅ OK / ⚠️ 要確認 / ❌ 要修正 / 🔧 本レポートで修正済み / 📋 報告のみ

---

## 1. ランディングページ (/)

metadata の実装: `src/app/layout.tsx`（全ページ共通ルート layout）

| 項目 | 値 | 状態 |
|------|-----|------|
| `<title>` | `SplanAI — AI Floor Plan Generator for Home Builders` | ⚠️ 後述 |
| `meta description` | `Turn any lot into 3 custom floor plan proposals in 30 seconds. AI-powered tool built for home builders. Close more deals with polished PDF proposals.` | ✅ |
| `og:type` | `website` | ✅ |
| `og:url` | `https://splanai.com` | ✅ |
| `og:site_name` | `SplanAI` | 🔧 追加済み（本レポートで修正） |
| `og:title` | `SplanAI — AI Floor Plan Generator for Home Builders` | ✅ |
| `og:description` | `Turn any lot into 3 custom floor plan proposals in 30 seconds. Close more deals with polished PDF proposals.` | ✅ |
| `og:image` | `https://splanai.com/og-image.png`（絶対 URL） | ✅ |
| `og:image` サイズ | 1200×630 px | ✅ |
| `og:image` ファイル存在 | `public/og-image.png`（85 KB） | ✅ |
| `og:image` ブランド確認 | SplanAI ロゴ・splanai.com ドメイン表示。旧名 HomePlanAI なし | ✅ |
| `twitter:card` | `summary_large_image` | ✅ |
| `twitter:title` | `SplanAI — AI Floor Plan Generator for Home Builders` | ✅ |
| `twitter:image` | `https://splanai.com/og-image.png`（絶対 URL） | ✅ |
| `canonical` | `https://splanai.com` | ✅ |
| `robots` | `index, follow` | ✅ |
| 旧名 "HomePlanAI" 残存 | なし | ✅ |
| ドメイン（vercel.app ではないか） | splanai.com | ✅ |

### ⚠️ title の「for Home Builders」サフィックス

仕様で想定されている title は `"SplanAI — AI Floor Plan Generator"` だが、
現在の値は `"SplanAI — AI Floor Plan Generator for Home Builders"`。
SEO 的には詳細な方が有利なため本レポートでは自動修正せず。
短縮する場合は layout.tsx の `title` / `og:title` / `twitter:title` を一括変更。

---

## 2. /pricing ページ

| 状態 |
|------|
| 📋 `src/app/pricing/page.tsx` は存在しない。`/pricing` へのアクセスは 404。 |

**報告**: 現在 `/` の料金セクション（ID `#pricing`）がその役割を担っており、
`/pricing` は未実装。LP の料金セクションへの anchor リンク（`/#pricing`）で代替されているため
ローンチ上の実害はないが、今後のページ分割時に要対応。

---

## 3. 顧客共有ポータル /s/[slug]

metadata の実装: `src/app/s/[slug]/page.tsx`

| 項目 | 状態 |
|------|------|
| `generateMetadata` 実装 | 📋 なし（layout.tsx のデフォルト metadata を継承） |
| 継承される `og:title` | `SplanAI — AI Floor Plan Generator for Home Builders`（汎用） |
| 継承される `og:url` | `https://splanai.com`（slug 固有 URL にならない） |
| 継承される `og:description` | LP 用汎用文 |

**報告**: `/s/[slug]` ページには `generateMetadata` が実装されていないため、
全共有リンクが同一の汎用 OGP（LP の内容）を持つ。SNS でシェアされた場合、
顧客名や物件固有の情報が OGP に反映されない。

**ローンチ影響**: ProductHunt 用 SNS 投稿では主に `/`（LP）が共有される想定のため、
ローンチ即日の影響は低い。ただし顧客が共有リンクを SNS 投稿した場合は汎用 OGP が表示される。

**推奨（post-launch）**: `generateMetadata` を追加し、slug から clientName・plans を取得して
`og:title: "${clientName}'s Floor Plans — SplanAI"`、`og:url: "https://splanai.com/s/${slug}"` を設定。

---

## 4. ドメインハードコード確認（OGP 関連コード外）

OGP・メタタグ・canonical のコードは全て `splanai.com` を正しく参照しているが、
以下のファイルで旧 fallback URL が残存している。  
**これらは本タスクのスコープ外（OGP 以外のコード）のため修正せず報告のみ**。

| ファイル | 行 | 内容 |
|---------|-----|------|
| `src/app/dashboard/DashboardClient.tsx` | 62 | `process.env.NEXT_PUBLIC_APP_URL ?? "https://homeplan-ai.vercel.app"` |
| `src/app/api/share/create/route.ts` | 59 | `process.env.NEXT_PUBLIC_APP_URL ?? 'https://homeplan-ai.vercel.app'` |

**実害なし**: Vercel 本番環境では `NEXT_PUBLIC_APP_URL=https://splanai.com` が設定済みのため、
fallback が使われることはない。ただしローカル開発時は `.env.local` に `NEXT_PUBLIC_APP_URL` が
ないと `homeplan-ai.vercel.app` が fallback になる（現状 `.env.local` には `localhost:3000` を設定済み）。

**推奨（post-launch）**: 両ファイルの fallback を `"https://splanai.com"` に変更。

---

## 5. その他 / JSON-LD

| 項目 | 状態 |
|------|------|
| JSON-LD 実装 | 📋 なし（現時点では未実装） |
| 旧名 "HomePlanAI" の全体検索 | 上記2ファイルの fallback URL のみ。OGP/meta 内にはなし |

---

## 修正サマリー

| ID | 内容 | アクション |
|----|------|----------|
| FIX-1 | `og:site_name: "SplanAI"` 追加（`layout.tsx`） | 🔧 修正済み・commit 予定 |
| RPT-1 | title に "for Home Builders" サフィックス（spec と差分） | ⚠️ 確認待ち |
| RPT-2 | `/pricing` ページ未実装 | 📋 報告のみ |
| RPT-3 | `/s/[slug]` に `generateMetadata` なし | 📋 post-launch 推奨 |
| RPT-4 | 旧 fallback URL `homeplan-ai.vercel.app`（2ファイル） | 📋 post-launch 推奨 |
| RPT-5 | JSON-LD 未実装 | 📋 post-launch 推奨 |
