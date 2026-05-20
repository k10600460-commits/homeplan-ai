import sharp from "../node_modules/sharp/lib/index.js";
import { writeFileSync } from "fs";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
  <defs>
    <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
      <path d="M 60 0 L 0 0 0 60" fill="none" stroke="#3B82F6" stroke-width="0.5" opacity="0.12"/>
    </pattern>
    <radialGradient id="glow" cx="50%" cy="0%" r="70%">
      <stop offset="0%" stop-color="#3B82F6" stop-opacity="0.22"/>
      <stop offset="100%" stop-color="#0F172A" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <!-- Background -->
  <rect width="1200" height="630" fill="#0F172A"/>
  <rect width="1200" height="630" fill="url(#grid)"/>
  <rect width="1200" height="630" fill="url(#glow)"/>

  <!-- Logo -->
  <text x="600" y="220" text-anchor="middle"
    font-family="system-ui, sans-serif" font-size="80" font-weight="800" letter-spacing="-2">
    <tspan fill="#FFFFFF">Splan</tspan><tspan fill="#3B82F6">AI</tspan>
  </text>

  <!-- Tagline -->
  <text x="600" y="295" text-anchor="middle"
    font-family="system-ui, sans-serif" font-size="28" fill="#94A3B8">
    Turn any lot into 3 floor plans in 30 seconds
  </text>

  <!-- Divider -->
  <line x1="500" y1="330" x2="700" y2="330" stroke="#3B82F6" stroke-width="1.5" opacity="0.35"/>

  <!-- Stat 1 -->
  <text x="260" y="405" text-anchor="middle"
    font-family="system-ui, sans-serif" font-size="52" font-weight="800" fill="#FFFFFF">30s</text>
  <text x="260" y="438" text-anchor="middle"
    font-family="system-ui, sans-serif" font-size="17" fill="#64748B">to generate</text>

  <!-- Stat 2 -->
  <text x="600" y="405" text-anchor="middle"
    font-family="system-ui, sans-serif" font-size="52" font-weight="800" fill="#FFFFFF">3 plans</text>
  <text x="600" y="438" text-anchor="middle"
    font-family="system-ui, sans-serif" font-size="17" fill="#64748B">per session</text>

  <!-- Stat 3 -->
  <text x="940" y="405" text-anchor="middle"
    font-family="system-ui, sans-serif" font-size="52" font-weight="800" fill="#FFFFFF">14-day</text>
  <text x="940" y="438" text-anchor="middle"
    font-family="system-ui, sans-serif" font-size="17" fill="#64748B">free trial</text>

  <!-- URL -->
  <text x="600" y="555" text-anchor="middle"
    font-family="system-ui, sans-serif" font-size="20" fill="#3B82F6" opacity="0.75">
    splanai.com
  </text>
</svg>`;

await sharp(Buffer.from(svg))
  .png()
  .toFile("public/og-image.png");

console.log("og-image.png created at public/og-image.png (1200x630)");
