# Vercel WAF & Security Checklist — SplanAI Launch

> 人間が Vercel Dashboard で実施する設定項目。
> コードでは対応不可な部分のみ記載。

---

## 1. Firewall Rules（手動設定）

Vercel Dashboard → Project → Firewall → Rules

### 推奨ルール

| Rule | Condition | Action | Priority |
|------|-----------|--------|----------|
| Block bad bots | User-Agent contains `sqlmap\|nikto\|nmap\|masscan\|python-requests` | Block (403) | 1 |
| Auth rate limit | Path matches `/login` AND req/min > 10 per IP | Challenge (CAPTCHA) | 2 |
| API protect | Path matches `/api/*` AND Country is sanctioned list | Block (403) | 3 |

### 手順
1. Vercel Dashboard → your project → **Firewall** タブ
2. **Create Rule** をクリック
3. Condition: `Request Path` / `User-Agent` / `Country` から選択
4. Action: `Block` (即遮断) or `Challenge` (CAPTCHA表示)
5. Save → Deployなし・即反映

---

## 2. Managed Rules（ワンクリック有効化）

Vercel Dashboard → Firewall → **Managed Rules**

有効化すべきルールセット:

- [x] **OWASP Core Rule Set** — SQLi, XSS, path traversal など共通攻撃をブロック
- [x] **Bot Protection** — 悪意あるクローラー・スキャナーをブロック
- [ ] **DDoS Protection** — Pro plan 以上で有効（現在 Hobby なら自動で基本保護あり）

---

## 3. Bot Protection（Vercel Speed Insights とは別）

Vercel Dashboard → Firewall → **Bot Protection**

設定:
- Mode: **Block** (最強) または **Challenge** (CAPTCHA) を選択
- Exceptions: `Googlebot`, `Bingbot`, `facebookexternalhit` は許可
- Note: PH launch 当日はトラフィックが急増するので `Challenge` 推奨（`Block` だと正規ユーザーが引っかかる可能性）

---

## 4. Rate Limiting（Vercel ネイティブ）

> アプリ内実装（`src/lib/security.ts`）は per-instance の in-memory。
> Vercel WAF のエッジ rate limit はグローバルで効果が高い。

Vercel Dashboard → Firewall → **Rate Limiting**

| Path | Limit | Window | Action |
|------|-------|--------|--------|
| `/api/generate` | 10 req | 1 min / IP | Block |
| `/api/mls/*` | 15 req | 1 min / IP | Block |
| `/api/checkout` | 5 req | 15 min / IP | Block |
| `/login` | 10 req | 5 min / IP | Challenge |

---

## 5. 動作確認方法

### エッジ WAF が機能しているか
```bash
# SQLi パターンを含む URL で 403 が返るか
curl -I "https://splanai.com/api/generate?id=1%27+OR+%271%27%3D%271"
# 期待: HTTP/2 403

# 正常リクエスト
curl -I "https://splanai.com"
# 期待: HTTP/2 200
```

### Rate limit が機能しているか
```bash
# 短時間で連続リクエスト
for i in $(seq 1 15); do curl -s -o /dev/null -w "%{http_code}\n" "https://splanai.com/api/generate"; done
# 期待: 200 が数回続いた後に 429 が出現
```

---

## 6. Launch 当日の注意事項

- PH launch（5/26 PST 0:00 = JST 17:00）の **30分前** に WAF ログを確認
- 異常な IP からのスパイクを検知したら即 Block rule を追加
- Vercel Analytics でリアルタイムトラフィックを監視
- 問題時の切り戻し: Firewall rules を disable（コードデプロイ不要）

---

_作成: 2026-05-21 | セキュリティ監査 security/launch-hardening-20260521_
