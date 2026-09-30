/** One tiny bounded request, never logs upstream messages or credentials. */
export {};
async function main() {
  if (!process.argv.includes("--allow-paid")) throw new Error("approval flag required");
  const key = process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN;
  if (!key) throw new Error("gateway unavailable");
  const r = await fetch("https://ai-gateway.vercel.sh/v1/responses", {
    method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(20_000),
    body: JSON.stringify({ model: "openai/gpt-6-luna", input: "Reply OK.", max_output_tokens: 16, reasoning: { effort: "none" }, store: false }),
  });
  const data = await r.json();
  const msg = String(data.error?.message ?? "");
  const clean = (v: unknown) => typeof v === "string" && /^[a-z0-9_.-]{1,80}$/i.test(v) ? v : undefined;
  console.log("SPLANAI_GATEWAY_DIAGNOSTIC=" + JSON.stringify({ status: r.status, type: clean(data.error?.type), code: clean(data.error?.code),
    requiresPaidCredits: /paid|payment|purchase|top.up/i.test(msg), mentionsFreeCredits: /free.{0,15}credit/i.test(msg),
    insufficientCredits: /insufficient|balance|credit/i.test(msg), modelAccessRestricted: /model|access|permission/i.test(msg),
    deploymentRestriction: /deployment|build|environment|oidc/i.test(msg), success: r.ok,
    usage: r.ok ? { input_tokens: data.usage?.input_tokens, output_tokens: data.usage?.output_tokens } : undefined,
  }));
}
main().catch(() => { console.error("SPLANAI_GATEWAY_DIAGNOSTIC_FAILED"); process.exitCode = 1; });
