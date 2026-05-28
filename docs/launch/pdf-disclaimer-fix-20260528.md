# PDF免責文統一修正 — 2026-05-28

## 変更内容

SharePortalClient.tsx の PDF フッター免責文を results/page.tsx と同一文言に統一した。

| | ファイル:行 |
|-|-----------|
| 変更ファイル | [src/app/s/[slug]/SharePortalClient.tsx:290](../../src/app/s/[slug]/SharePortalClient.tsx#L290) |
| 参照元(正典) | [src/app/results/page.tsx:246](../../src/app/results/page.tsx#L246) |

## Before

```
"For informational purposes only. Data subject to change. Not a substitute for professional architectural or legal advice."
```

## After

```
"Floor-plan concepts are AI-generated for preliminary illustration only. They are not construction-ready drawings and may not comply with building codes or zoning. Verify with licensed professionals before relying on them."
```

## 非変更箇所

- [SharePortalClient.tsx:550](../../src/app/s/[slug]/SharePortalClient.tsx#L550) — 画面表示用免責（短文）は今回変更なし
- results/page.tsx — 正典ファイルのため変更なし

## Build

`✅ Compiled successfully` — 37 pages
