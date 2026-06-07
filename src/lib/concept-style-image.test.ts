/**
 * Unit tests for styleToImageKey.
 * Run with: npx tsx src/lib/concept-style-image.test.ts
 * (Add vitest/jest when a test runner is configured.)
 */
import { styleToImageKey, conceptImageSrc, styleImageUrl } from "./concept-style-image";
import assert from "node:assert/strict";

const cases: Array<[string, string]> = [
  // farmhouse wins (highest priority)
  ["modern farmhouse",                   "farmhouse"],
  ["hill country modern farmhouse",      "farmhouse"],
  // craftsman
  ["craftsman bungalow",                 "craftsman"],
  ["craftsman",                          "craftsman"],
  ["arts and crafts bungalow",           "craftsman"],
  // transitional beats traditional
  ["transitional tudor",                 "transitional"],
  // traditional keywords
  ["european cottage",                   "traditional"],
  ["hill country ranch",                 "traditional"],
  ["georgian colonial",                  "traditional"],
  ["santa barbara style",                "traditional"],
  ["mediterranean villa",                "traditional"],
  // contemporary keywords
  ["warm contemporary single-level",     "contemporary"],
  ["modern open concept",                "contemporary"],
  ["prairie style",                      "contemporary"],
  // default fallback
  ["coastal",                            "default"],
  ["",                                   "default"],
];

let passed = 0;
for (const [input, expected] of cases) {
  const actual = styleToImageKey(input);
  assert.equal(actual, expected, `styleToImageKey("${input}") → expected "${expected}", got "${actual}"`);
  passed++;
}

// conceptImageSrc: imageUrl override takes priority
assert.equal(conceptImageSrc("modern farmhouse", "https://example.com/custom.jpg"), "https://example.com/custom.jpg");
// When no imageUrl, returns the Storage URL for the matched style key
assert.equal(conceptImageSrc("modern farmhouse", null), styleImageUrl("modern farmhouse"));
assert.equal(conceptImageSrc("modern farmhouse"), styleImageUrl("modern farmhouse"));
assert.equal(conceptImageSrc("coastal"), styleImageUrl("coastal"));
passed += 4;

console.log(`✓ ${passed} assertions passed`);
