/** Read-only capability check. No inference, credential export, or account changes. */
async function main() {
  const direct = Boolean(process.env.OPENAI_API_KEY);
  const gateway = process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN;
  const result: Record<string, unknown> = {
    kind: "model_access_probe", inferenceCalls: 0,
    anthropicConfigured: Boolean(process.env.ANTHROPIC_API_KEY),
    openaiConfigured: direct, gatewayConfigured: Boolean(gateway),
  };
  if (gateway) {
    try {
      const response = await fetch("https://ai-gateway.vercel.sh/v1/credits", {
        headers: { Authorization: `Bearer ${gateway}` }, signal: AbortSignal.timeout(15_000),
      });
      result.gatewayCreditStatus = response.status;
      if (response.ok) {
        const data = await response.json();
        result.gatewayCredits = { balance: data.balance, total_used: data.total_used, total_granted: data.total_granted };
      }
    } catch { result.gatewayCreditStatus = "network_or_timeout"; }
  }
  console.log("SPLANAI_ACCESS_PROBE=" + JSON.stringify(result));
}
main().catch(() => { console.error("SPLANAI_ACCESS_PROBE_FAILED"); process.exitCode = 1; });
