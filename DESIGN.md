---
# ── Machine-readable design tokens (getdesign-style, A-010) ──────────
colors:
  ink: "#0F172A"        # slate-900 — structural surfaces (nav, hero, how, mission, footer)
  ink-deep: "#0B1120"   # one step darker — pricing bg ONLY (the single permitted 2nd navy)
  paper: "#F8FAFC"      # slate-50 — light page bg
  surface: "#FFFFFF"    # cards, light sections
  action: "#3B82F6"     # blue-500 — THE interactive color (hover: blue-600 #2563EB)
  live: "#10B981"       # emerald-500 — live/real-time/success signals ONLY
  premium: "#F59E0B"    # amber-500 — Team tier & PRO gating chips ONLY
  text-strong: "#0F172A"
  text-body: "#1E293B"  # slate-800
  text-muted: "#64748B" # slate-500 (light bg) / slate-400 (dark bg)
typography:
  family: "Geist (single family — no second font, ever)"
  display: "text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.1]"
  h2: "text-3xl sm:text-4xl font-extrabold tracking-tight"
  h3: "text-base/lg font-bold"
  body: "text-sm–lg leading-relaxed"
  eyebrow: "text-xs font-bold uppercase tracking-widest"
rounded:
  chip: "rounded-lg"      # 8px — small chips, inline tags
  control: "rounded-xl"   # 12px — buttons, inputs
  card: "rounded-2xl"     # 16px — cards, panels, mockup frames
spacing:
  section: "py-20 px-6 (statement sections py-24)"
  container: "max-w-7xl (nav/hero) · max-w-5xl/6xl (content) · max-w-3xl (prose)"
  card-pad: "p-7"
components:
  button-primary: "bg-{action} hover:bg-blue-600 text-white font-bold rounded-xl — Tailwind classes, never JS onMouseEnter"
  button-secondary: "border-2 border-slate-600 text-slate-300 hover:border-slate-400 (dark) / border-slate-200 (light)"
  card: "rounded-2xl border (1px) — hover: border/shadow shift only, no translate"
  icon: "inline stroke SVG, currentColor, strokeWidth 2, w-5/w-6 — one set, no emoji in LP chrome"
  blueprint-grid: "60px grid overlay @ 4–6% opacity on ink surfaces — the signature element"
motion:
  rule: "1 section = 1 effect"
  entrance: "AnimateIn fade+up 0.55s, child stagger ≤100ms — the ONLY scroll effect"
  hero: "4-phase product loop is the hero's one effect (no parallax on top)"
  reduced-motion: "always respected (existing pattern — keep)"
---

# DESIGN.md — SplanAI（薄く保つ・LP＝splanai.com の正）

> AIエージェントへ: LP/UIを変更する前にこのファイルを読む。ここに無い装飾・色・動きを足さない。
> Sprint10 (2026-07-04) で制定。手法: design-first（PPP-034/A-042）。

## 芯（SplanAIらしさ・1段落）

SplanAI は、米国の中小ホームビルダー（年10–50棟）が**客の前で開く営業道具**である。デザインは「よく引かれた施工図面」の質感を持つ：構造を支える1つの深いネイビー、決断を促す1つのアクションブルー、図面グリッドの精密さ、余白の落ち着き、そして**証拠は実プロダクトの出力そのもの**。誇張ゼロ・装飾最小・数字は全て実物。50歳のビルダーが$600Kの商談で画面共有しても恥ずかしくない——スタートアップの玩具ではなく、プロの道具に見えること。それが変換の前提条件である。

## 色の役割（1色1役）

| 役割 | 値 | 使用範囲 |
|---|---|---|
| 構造 | ink `#0F172A` | nav/hero/how/mission/footer の面 |
| 構造(深) | ink-deep `#0B1120` | pricing 背景のみ（第3のネイビー禁止） |
| 行動 | action `#3B82F6` | CTA・リンク・フォーカス＝**唯一のインタラクティブ色** |
| 実稼働 | live `#10B981` | "Live"・共有✓・チェックマークのみ |
| 上位 | premium `#F59E0B` | Team カード・PRO gating チップのみ |
| プラン三色 | blue/emerald/violet | **プロダクトのミラー（browser-chrome mockup）内のみ**＝製品の実UI規約 |

## 禁止リスト（AI-slop＝平均回帰パターン・A-032）

1. **絵文字をUIアイコンに使う**（😟💸📉🗺️📄📡…）→ stroke SVG 一式のみ。例外: プロダクトミラー内で実UIが絵文字を使う場合（実物準拠＝誠実）。
2. **アクセント色の増殖**: 1セクションに action 以外のアクセント2色以上・第3のネイビー・gray-* と slate-* の混在。
3. **フォントの使い回し/事故**: Arial/system 既定で描画（過去の実事故: Geist を読み込みながら globals.css の body が Arial で上書き）・第2ディスプレイフォント追加。
4. **インライン style の色リテラル＋JS hover**（onMouseEnter で色変更）→ Tailwind クラスへ。ドリフトの温床。
5. **捏造（DEC-005・絶対）**: 偽実績・偽ロゴ・偽証言・盛った数字・空のtestimonialsをでっち上げで埋める。実数字のみ（30 sec / 3 plans / 14-day / $49 / $149）。信頼が薄いなら「founding builders welcome」等の正直な枠で。
6. **HUMANIZE違反語**: AI-powered / revolutionary / game-changing / seamless / effortless。
7. **文字の詰め込み**: featureカード本文4行超＝書き直し。1セクション1メッセージ。
8. **装飾の積み増し**: グロー/blur をセクションに2つ以上・パララックス＋ループ＋グローの同時使用。モーションは1セクション1エフェクト。派手なら「控えめに」へ倒す。
9. **行末の孤立語**（見出しの orphan）: 375px で必ず確認。
10. **汎用SaaSテンプレ臭**: 意味のないロゴ壁・"Trusted by 10,000+ teams"系・スタートアップ的チャラさ。参照は借りても丸ごと真似ない。

## 不変条件（壊すと事業事故）

- **EN/ES parity**: `T` オブジェクトの en/es は構造一致を保つ（アイコンは言語非依存＝Tの外へ）。
- **価格の正**: LP表示は Pro $49 / Team $149・Free=3/月・Pro=100/月・Team=無制限(fair use)。founding $29/$99 は coupon 方式で**LPに出さない**。
- **gating文言は法務由来**: MLS（NAR/IDX・requires your MLS license）・fair use の `/terms#fair-use` リンク・"Powered by SplanAI footer included"（Pro）は正確に維持。
- **SEO/OGP/JSON-LD**: `page.tsx` の JSON-LD・`layout.tsx` の metadata・robots=AIクローラ許可（A-021 GEO）を削らない。
- **CTA動線**: nav→#generate・hero→#generate/#how・pricing→/login?tab=signup・Team→checkout・/try デモ・/s/nfhkewvz ライブポータル例。
- **repo名≠製品名は意図的**（homeplan-ai / SplanAI）。
- アーキ不変条件（RLS全テーブル・Stripe Live・cron冪等 等）は追記予定地——このファイルは薄く保つ。
