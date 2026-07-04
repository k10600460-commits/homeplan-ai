// LP mobile audit harness (Sprint10, DESIGN.md W4).
// Setup: npm i --no-save playwright-core  (uses system Chrome via channel:'chrome')
// Usage: node scripts/lp-mobile-audit.mjs [url]
import { chromium } from 'playwright-core';

const OUT = '/Users/Shoji.S/obsidian-vault/01_AI_OUTPUT';
const URL = process.argv[2] ?? 'http://localhost:3111/';
const browser = await chromium.launch({ channel: 'chrome', headless: true });

async function audit(width, height, slices = 0, prefix = '') {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 });
  await page.goto(URL, { waitUntil: 'networkidle' });
  // Scroll through the whole page so every AnimateIn (IntersectionObserver) fires,
  // then return to top and let transitions finish.
  await page.evaluate(async () => {
    for (let y = 0; y <= document.body.scrollHeight; y += 400) {
      window.scrollTo(0, y);
      await new Promise(r => setTimeout(r, 120));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(1500);
  const m = await page.evaluate(() => {
    const vw = window.innerWidth;
    const offenders = [];
    document.querySelectorAll('*').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.right > vw + 1 || r.left < -1) offenders.push({ cls: String(el.className).slice(0, 70), right: Math.round(r.right) });
    });
    // Tap targets: visible interactive elements shorter than 40px
    const small = [];
    document.querySelectorAll('a,button,select,input,summary').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && r.height < 40) small.push({ tag: el.tagName, h: Math.round(r.height), text: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 35) });
    });
    return {
      scrollWidth: document.documentElement.scrollWidth, vw,
      font: getComputedStyle(document.body).fontFamily.slice(0, 60),
      h1Font: getComputedStyle(document.querySelector('h1')).fontFamily.slice(0, 40),
      pageHeight: document.documentElement.scrollHeight,
      offenders: offenders.slice(0, 8), smallTaps: small.slice(0, 20),
    };
  });
  console.log(`── ${width}px ──`, JSON.stringify(m, null, 1));
  if (slices > 0) {
    const sliceH = Math.ceil(m.pageHeight / slices);
    for (let i = 0; i < slices; i++) {
      const y = i * sliceH;
      const h = Math.min(sliceH, m.pageHeight - y);
      if (h <= 0) break;
      await page.screenshot({ path: `${OUT}/${prefix}${i}.png`, clip: { x: 0, y, width, height: h }, fullPage: true });
    }
  }
  await page.close();
  return m;
}

await audit(375, 812, 6, 'lpm375-');
await audit(390, 844, 0);
await audit(768, 1024, 3, 'lpm768-');
// Desktop hero for comparison
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.screenshot({ path: `${OUT}/lpm1440-hero.png` });
await page.close();
await browser.close();
console.log('done');
