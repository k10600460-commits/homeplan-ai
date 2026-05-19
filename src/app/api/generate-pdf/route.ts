import { NextRequest, NextResponse } from 'next/server';
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import path from 'path';
import fs from 'fs';

export const runtime = 'nodejs';
export const maxDuration = 30;

function injectLocalFont(html: string): string {
  const fontPath = path.join(process.cwd(), 'public', 'fonts', 'NotoSansCJK-Regular.woff2');
  if (!fs.existsSync(fontPath)) return html;
  const base64 = fs.readFileSync(fontPath).toString('base64');
  const style = `<style>@font-face{font-family:'Noto Sans CJK SC';src:url('data:font/woff2;base64,${base64}')format('woff2');font-weight:400;font-style:normal;}</style>`;
  return html.replace('<head>', `<head>${style}`);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { html?: string; language?: string };
    const { html, language } = body;

    if (!html || language !== 'zh') {
      return NextResponse.json({ error: 'html and language:"zh" are required' }, { status: 400 });
    }

    const htmlWithFont = injectLocalFont(html);

    const executablePath = await chromium.executablePath();

    const browser = await puppeteer.launch({
      args: chromium.args,
      executablePath,
      headless: true,
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 794, height: 1123 });
    await page.setContent(htmlWithFont, { waitUntil: 'load' });
    // Extra wait for Google Fonts to load if local font is absent
    await page.evaluateHandle('document.fonts.ready');

    const pdfBytes = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    });

    await browser.close();

    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="SplanAI-Floor-Plans-ZH.pdf"',
      },
    });
  } catch (err) {
    console.error('[generate-pdf]', err);
    return NextResponse.json({ error: 'PDF generation failed' }, { status: 500 });
  }
}
