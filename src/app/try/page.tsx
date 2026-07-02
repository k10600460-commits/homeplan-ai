import type { Metadata } from "next";
import { randomUUID } from "node:crypto";
import { signPayload } from "@/lib/crypto";
import TryClient from "./TryClient";

// Token must be minted per-request (it carries an issued-at timestamp the API
// verifies), so this page can never be statically prerendered.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Try a sample proposal — no signup | SplanAI",
  description:
    "Enter a lot size and budget, get one sample home concept in about 30 seconds. No signup, no credit card — see what SplanAI hands your buyers.",
};

function mintToken(): string {
  try {
    // nonce makes every issued token unique (codex review). The token is a
    // friction layer, not the primary guard — that's the DB claim + cap.
    return signPayload({ purpose: "try-demo", iat: Date.now(), nonce: randomUUID() });
  } catch {
    // AES_ENCRYPTION_KEY missing (local dev without env). The API route only
    // accepts this fallback outside production.
    if (process.env.NODE_ENV !== "production") return `dev-unsigned:${Date.now()}`;
    return "";
  }
}

export default function TryPage() {
  return <TryClient token={mintToken()} />;
}
