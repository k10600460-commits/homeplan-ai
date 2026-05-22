# scripts/ — SplanAI ユーティリティスクリプト集

このディレクトリはプロダクションコード (`src/`) と完全に分離した  
一時的・運用的なスクリプトを格納します。

---

## fetch-builders.ts — ホームビルダーリスト取得

Google Places API (Text Search v2 / New) を使って TX・FL の主要 30 都市の  
カスタムホームビルダーを検索し、`builders.csv` に出力します。

### 出力フォーマット

```
name,address,phone,website,city,state
"ABC Home Builders","1234 Oak St, Houston, TX 77001","(713) 555-0100","https://abc-homes.com","Houston","TX"
...
```

---

### 準備: 別 GCP プロジェクトの作成

**⚠️ 本番 SplanAI の GCP プロジェクト (`GOOGLE_MAPS_API_KEY`) とは必ず分離すること。**  
営業リスト取得は SplanAI のサービスとは無関係な用途なので、課金・quota を分ける。

1. [Google Cloud Console](https://console.cloud.google.com/) を開く
2. 上部のプロジェクト選択 → **「新しいプロジェクト」** → 名前例: `splanai-sales-research`
3. 作成後、左メニュー → **「APIとサービス」→「ライブラリ」**
4. `Places API (New)` を検索して **有効化**
5. **「APIとサービス」→「認証情報」→「認証情報を作成」→「APIキー」**
6. 作成された API キーをコピー
7. **APIキーの制限** (推奨):  
   - アプリケーションの制限: IP アドレス → 自分の IP のみ許可  
   - APIの制限: Places API (New) のみ

---

### 環境変数の設定

`.env.local.example` を参考に `.env.builders` を作成:

```bash
cp .env.local.example .env.builders
# .env.builders を編集して PLACES_API_KEY に GCP コンソールのキーを貼り付け
```

または直接 export:

```bash
export PLACES_API_KEY="AIza..."
```

---

### 実行方法

```bash
# 方法1: tsx を使う (推奨)
npx tsx scripts/fetch-builders.ts

# 方法2: ts-node を使う
npx ts-node scripts/fetch-builders.ts

# 環境変数ファイルと合わせて実行する場合
PLACES_API_KEY=$(grep PLACES_API_KEY .env.builders | cut -d= -f2) \
  npx tsx scripts/fetch-builders.ts
```

完了すると `builders.csv` がリポジトリルートに生成されます。

---

### 想定コスト

#### Text Search (New) の料金体系 (2026年時点)

| 使用フィールド | 単価 |
|---|---|
| Basic フィールドのみ (名前・住所・電話・URL) | $0.016 / リクエスト |
| Advanced フィールド含む | $0.032 / リクエスト |
| Preferred フィールド含む | $0.040 / リクエスト |

本スクリプトは **Basic フィールドのみ** (`displayName`, `formattedAddress`, `nationalPhoneNumber`, `websiteUri`) を使用。

#### 計算

```
30 都市 × $0.016 = $0.48
```

**月 5,000 リクエストの無料枠 ($200 相当) に対して極めて小さい。**  
月1回実行しても問題なし。

#### 無料枠を超えないための注意

- 本スクリプトは 1 都市 = 1 リクエスト (最大 20 件)
- 月 5,000 リクエスト ÷ 30 都市 = 月 166 回実行まで無料
- 通常の営業活動では月 1〜2 回の実行で十分

---

### builders.csv の扱い

- `.gitignore` に `builders.csv` を追加して git に含めないこと  
  (個人情報・ビジネス情報が含まれるため)
- 取得後は Google Sheets や Notion にインポートして管理する

```bash
# .gitignore に追加する場合
echo "builders.csv" >> .gitignore
```

---

### トラブルシューティング

| エラー | 原因と対処 |
|---|---|
| `PLACES_API_KEY が未設定` | 環境変数をセットする |
| `HTTP 403` | Places API (New) が有効化されていない / キーの制限が厳しすぎる |
| `HTTP 429` | レート制限。`SLEEP_MS` を 500〜1000ms に増やして再実行 |
| 結果が 0 件 | クエリが該当しない都市の可能性。ログで確認 |

---

## その他のスクリプト

| ファイル | 用途 |
|---|---|
| `x-analytics-sync.ts` | X (Twitter) の投稿メトリクスを Obsidian に記録 |
| `generate-og.mjs` | OG 画像の生成 |
| `pdf-to-foam.sh` | PDF → Foam ノート変換 |
| `save-to-foam.sh` | 任意テキストを Foam に保存 |
| `download-cjk-font.sh` | CJK フォント (NotoSansCJK) のダウンロード |
