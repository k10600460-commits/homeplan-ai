/** Small client-safe copy helper; never imports provider SDKs or schemas. */
export function conceptAreaNote(plan: { calculationBasis?: string; omittedProseClaims?: number }): string {
  const basis = plan.calculationBasis?.startsWith("room-ledger-")
    ? "Approximate interior area is summed from the listed rooms, including circulation and wall allowances, excluding the garage. Not a measured or code-certified area."
    : "Room sizes and totals are AI estimates and may not reconcile. Verify measurements before use.";
  return basis + ((plan.omittedProseClaims ?? 0) > 0 ? " Unverified numeric claims were omitted from the description." : "");
}
