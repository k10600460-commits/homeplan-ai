/**
 * Unit tests for email header sanitization and href scheme validation.
 * Run with: RESEND_API_KEY=re_dummy npx tsx src/lib/emails.test.ts
 * (emails.ts constructs a Resend client at module scope, so a dummy key is
 * needed. Same tsx+assert convention as concept-style-image.test.ts.)
 */
import { sanitizeEmailHeader, safeMailtoHref, safeTelHref } from "./emails";
import assert from "node:assert/strict";

let passed = 0;
function ok(cond: boolean, msg: string) {
  assert.ok(cond, msg);
  passed++;
}

// ── sanitizeEmailHeader: CRLF / control-char injection ──
{
  const attack = "buyer@example.com\r\nBcc: victim@example.com\r\nSubject: phish";
  const out = sanitizeEmailHeader(attack);
  ok(!/[\r\n]/.test(out), `CR/LF must be stripped — got ${JSON.stringify(out)}`);
  ok(out.includes("buyer@example.com"), "legit part survives");
}
{
  const out = sanitizeEmailHeader("Alert: draft failed\r\nX-Injected: 1");
  ok(!/[\r\n\x00-\x1f\x7f]/.test(out), "control chars stripped from subject-style value");
}
ok(sanitizeEmailHeader("plain subject — ok") === "plain subject — ok", "clean value unchanged");
ok(sanitizeEmailHeader("a\x00b\x1fc\x7fd") === "a b c d", "NUL/US/DEL collapsed to spaces");

// ── safeMailtoHref: scheme smuggling rejected ──
ok(safeMailtoHref("buyer@example.com") === "mailto:buyer@example.com", "plain email linked");
ok(safeMailtoHref("javascript:alert(1)") === null, "javascript: scheme rejected");
ok(safeMailtoHref("javascript:alert(1)@example.com") === null, "colon in local part rejected");
ok(safeMailtoHref("data:text/html;base64,xxx@example.com") === null, "data:-style value rejected");
ok(safeMailtoHref('buyer@example.com" onmouseover="alert(1)') === null, "attribute breakout rejected");
ok(safeMailtoHref("buyer@example.com?cc=victim@example.com") === null, "query-param smuggling rejected");
ok(safeMailtoHref("buyer@example.com\r\nBcc: x@y.com") === null, "CRLF value rejected");
ok(safeMailtoHref(null) === null, "null → null");
ok(safeMailtoHref("") === null, "empty → null");

// ── safeTelHref ──
ok(safeTelHref("+1 (555) 123-4567") === "tel:+15551234567", "plain phone linked, normalized");
ok(safeTelHref("555.123.4567") === "tel:5551234567", "dotted phone linked");
ok(safeTelHref("javascript:alert(1)") === null, "javascript: scheme rejected in tel");
ok(safeTelHref("555-1234; rm -rf /") === null, "junk after phone rejected");
ok(safeTelHref(null) === null, "null → null");

console.log(`emails.test.ts: all ${passed} assertions passed ✅`);
