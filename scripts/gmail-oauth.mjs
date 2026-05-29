#!/usr/bin/env node
/**
 * gmail-oauth.mjs — Gmail OAuth2 refresh_token 取得スクリプト
 *
 * 用途: SplanAI daily-brief cron が hello@splanai.com の受信トレイを
 *       読むために必要な refresh_token をローカルで一度取得する。
 *       取得した token はターミナルに表示するだけで保存しない。
 *
 * ════════════════════════════════════════════════════════════════
 *  事前準備（Google Cloud Console）
 * ════════════════════════════════════════════════════════════════
 *
 * 1. Google Cloud Console を開く
 *    https://console.cloud.google.com/
 *
 * 2. プロジェクトを選択 or 新規作成（例: "splanai-secretary"）
 *
 * 3. Gmail API を有効化
 *    「APIとサービス」→「ライブラリ」→ "Gmail API" → 有効化
 *
 * 4. OAuth 同意画面を設定
 *    「APIとサービス」→「OAuth 同意画面」
 *    - User Type: External
 *    - アプリ名: SplanAI Secretary
 *    - スコープ: https://www.googleapis.com/auth/gmail.modify を追加
 *      （.readonly だと将来の Draft 作成に不足するため .modify を推奨）
 *    - テストユーザー: hello@splanai.com を追加
 *    - ステータスを「テスト」のまま保存（個人用途なら公開不要）
 *
 * 5. OAuth 2.0 クライアント ID を作成
 *    「認証情報」→「認証情報を作成」→「OAuth 2.0 クライアント ID」
 *    - アプリケーションの種類: デスクトップ アプリ
 *    - 名前: SplanAI Secretary CLI
 *    → client_id と client_secret をメモ
 *
 * 6. Redirect URI の追加（重要）
 *    作成したクライアント ID を開き、
 *    「承認済みのリダイレクト URI」に以下を追加して保存:
 *      http://localhost:3001/callback
 *
 * ════════════════════════════════════════════════════════════════
 *  実行手順
 * ════════════════════════════════════════════════════════════════
 *
 * 1. .env.local（または .env）に以下を設定（.gitignore 済）
 *      GMAIL_CLIENT_ID=...apps.googleusercontent.com
 *      GMAIL_CLIENT_SECRET=GOCSPX-...
 *
 * 2. スクリプトを実行
 *      node scripts/gmail-oauth.mjs
 *
 * 3. ターミナルに表示された URL をブラウザで開く
 *
 * 4. hello@splanai.com でログインして「許可」をクリック
 *
 * 5. ブラウザが http://localhost:3001/callback に遷移し、
 *    ターミナルに refresh_token が表示される
 *
 * 6. 表示された refresh_token をメモし、Vercel に設定（下記参照）
 *
 * ════════════════════════════════════════════════════════════════
 *  Vercel 環境変数の設定
 * ════════════════════════════════════════════════════════════════
 *
 * 以下のコマンドを順番に実行（値を聞かれるので貼り付け → Enter）:
 *
 *   vercel env add CRON_SECRET Production
 *   vercel env add GMAIL_CLIENT_ID Production
 *   vercel env add GMAIL_CLIENT_SECRET Production
 *   vercel env add GMAIL_REFRESH_TOKEN Production
 *
 * または Vercel Dashboard → Settings → Environment Variables から追加も可。
 *
 * ════════════════════════════════════════════════════════════════
 *  注意事項
 * ════════════════════════════════════════════════════════════════
 * - このスクリプトはキーをファイルに書き込まない。表示のみ。
 * - refresh_token は一度しか表示されないため必ずメモすること。
 * - OAuth 同意画面がテストモードの場合、refresh_token は 7 日で
 *   失効しないが、アクセスできるのはテストユーザーのみ。
 *   本番化（公開）は不要 — 自分専用なのでテストモードのままでよい。
 * - GMAIL_REFRESH_TOKEN を Vercel に設定後、
 *   `vercel env pull .env.local` で手元を同期可能。
 */

import http from "http";
import { URL } from "url";

// ── env 読み込み（.env.local → .env の順でフォールバック） ──────────────
import { readFileSync, existsSync } from "fs";
import { join, resolve } from "path";

function loadEnv() {
  const root = resolve(process.cwd());
  for (const name of [".env.local", ".env"]) {
    const p = join(root, name);
    if (!existsSync(p)) continue;
    const lines = readFileSync(p, "utf-8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, "");
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

loadEnv();

const CLIENT_ID = process.env.GMAIL_CLIENT_ID;
const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
const REDIRECT_URI = "http://localhost:3001/callback";
const PORT = 3001;

// gmail.modify は読み取り + Draft 作成の両方をカバー
// .readonly のみでよければ 'https://www.googleapis.com/auth/gmail.readonly'
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.modify",
];

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error(`
ERROR: GMAIL_CLIENT_ID または GMAIL_CLIENT_SECRET が未設定です。

.env.local に以下を追加してください:
  GMAIL_CLIENT_ID=...apps.googleusercontent.com
  GMAIL_CLIENT_SECRET=GOCSPX-...
`);
  process.exit(1);
}

// ── 認可 URL 生成 ──────────────────────────────────────────────────────────
const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
authUrl.searchParams.set("client_id", CLIENT_ID);
authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
authUrl.searchParams.set("response_type", "code");
authUrl.searchParams.set("scope", SCOPES.join(" "));
authUrl.searchParams.set("access_type", "offline");
authUrl.searchParams.set("prompt", "consent"); // 毎回 refresh_token を返す

console.log("\n══════════════════════════════════════════════════════════");
console.log("  SplanAI Gmail OAuth — refresh_token 取得");
console.log("══════════════════════════════════════════════════════════\n");
console.log("以下の URL をブラウザで開き、hello@splanai.com でログインして\n「許可」をクリックしてください:\n");
console.log(authUrl.toString());
console.log("\nローカルサーバーを起動しています（ポート " + PORT + "）…\n");

// ── localhost でコールバックを受け取る ────────────────────────────────────
const server = http.createServer(async (req, res) => {
  if (!req.url?.startsWith("/callback")) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error) {
    res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`<h2>エラー: ${error}</h2><p>ウィンドウを閉じてください。</p>`);
    console.error("\nERROR:", error);
    server.close();
    return;
  }

  if (!code) {
    res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
    res.end("<h2>code が受け取れませんでした。再試行してください。</h2>");
    server.close();
    return;
  }

  // code → tokens 交換
  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: "authorization_code",
      }),
    });

    const tokens = await tokenRes.json();

    if (!tokenRes.ok || !tokens.refresh_token) {
      const msg = tokens.error_description ?? tokens.error ?? "token exchange failed";
      res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
      res.end(`<h2>トークン取得失敗: ${msg}</h2><p>ウィンドウを閉じてください。</p>`);
      console.error("\nToken error:", JSON.stringify(tokens, null, 2));
      server.close();
      return;
    }

    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`
      <html><body style="font-family:sans-serif;padding:32px;">
        <h2 style="color:#10b981;">✓ 認可成功！</h2>
        <p>このウィンドウを閉じて、ターミナルに表示された <code>refresh_token</code> をメモしてください。</p>
      </body></html>
    `);

    console.log("\n══════════════════════════════════════════════════════════");
    console.log("  ✓ 認可成功！以下の値を Vercel に設定してください:");
    console.log("══════════════════════════════════════════════════════════\n");
    console.log("GMAIL_REFRESH_TOKEN=");
    console.log(tokens.refresh_token);
    console.log("\n──────────────────────────────────────────────────────────");
    console.log("Vercel 環境変数設定コマンド（Production）:");
    console.log("──────────────────────────────────────────────────────────");
    console.log("\n  vercel env add CRON_SECRET Production");
    console.log("  vercel env add GMAIL_CLIENT_ID Production");
    console.log("  vercel env add GMAIL_CLIENT_SECRET Production");
    console.log("  vercel env add GMAIL_REFRESH_TOKEN Production");
    console.log("\n各コマンドを実行すると値を入力するプロンプトが出ます。");
    console.log("または Vercel Dashboard → Settings → Environment Variables から設定も可。");
    console.log("\nデプロイ後の動作確認:");
    console.log("  curl -H 'Authorization: Bearer <CRON_SECRET>' \\");
    console.log("    https://splanai.com/api/cron/daily-brief");
    console.log("\n══════════════════════════════════════════════════════════\n");

    server.close();
  } catch (err) {
    res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`<h2>エラー: ${err instanceof Error ? err.message : String(err)}</h2>`);
    console.error("\nException:", err);
    server.close();
  }
});

server.listen(PORT, "localhost", () => {
  console.log(`サーバー起動 → http://localhost:${PORT}/callback で待機中…`);
});

server.on("error", (err) => {
  if ((err).code === "EADDRINUSE") {
    console.error(`\nERROR: ポート ${PORT} がすでに使用中です。`);
    console.error("他のプロセスを停止してから再実行してください: lsof -ti :3001 | xargs kill");
  } else {
    console.error("Server error:", err);
  }
  process.exit(1);
});
