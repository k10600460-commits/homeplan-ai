import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';

export const runtime = 'nodejs';
export const maxDuration = 15;

interface PlanData {
  id: number;
  name: string;
  style: string;
  squareFootage: number;
  bedrooms: number;
  bathrooms: number;
  stories: number;
  estimatedCost: number;
  description: string;
  features: string[];
  rooms: { name: string; sqft: number }[];
  highlights: string[];
}

const PLAN_COLORS = ['#2563EB', '#10B981', '#7C3AED'];

function getFonts(): { fonts: Record<string, object>; defaultFont: string } {
  const ttfPath = path.join(process.cwd(), 'public', 'fonts', 'NotoSansCJK-Regular.ttf');
  if (fs.existsSync(ttfPath)) {
    return {
      fonts: { NotoSansCJK: { normal: ttfPath, bold: ttfPath, italics: ttfPath, bolditalics: ttfPath } },
      defaultFont: 'NotoSansCJK',
    };
  }
  // Fallback: pdfmake built-in Roboto (CJK will render as squares, but PDF generates)
  const base = path.join(process.cwd(), 'node_modules', 'pdfmake', 'examples', 'fonts');
  return {
    fonts: {
      Roboto: {
        normal: path.join(base, 'Roboto-Regular.ttf'),
        bold: path.join(base, 'Roboto-Medium.ttf'),
        italics: path.join(base, 'Roboto-Italic.ttf'),
        bolditalics: path.join(base, 'Roboto-MediumItalic.ttf'),
      },
    },
    defaultFont: 'Roboto',
  };
}

function buildDocDefinition(plans: PlanData[], defaultFont: string): object {
  const date = new Date().toLocaleDateString('zh-CN', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const content: any[] = [];

  plans.forEach((plan, i) => {
    const color = PLAN_COLORS[i % PLAN_COLORS.length];
    const isLast = i === plans.length - 1;

    // ── Header (colored background via table) ──────────────────
    content.push({
      table: {
        widths: ['*'],
        body: [[{
          stack: [
            { text: `方案 ${plan.id}`, fontSize: 9, bold: true, letterSpacing: 3, opacity: 0.8, margin: [0, 0, 0, 4] },
            { text: plan.name, fontSize: 22, bold: true, margin: [0, 0, 0, 3] },
            { text: plan.style, fontSize: 12 },
          ],
          color: 'white',
          fillColor: color,
          border: [false, false, false, false],
          margin: [20, 20, 20, 18],
        }]],
      },
      layout: 'noBorders',
      margin: [0, 0, 0, 14],
    });

    // ── Stats row ─────────────────────────────────────────────
    content.push({
      columns: [
        { stack: [{ text: plan.squareFootage.toLocaleString(), fontSize: 18, bold: true, color: '#0f172a' }, { text: '平方英尺', fontSize: 9, color: '#64748b', margin: [0, 2, 0, 0] }], alignment: 'center' },
        { stack: [{ text: String(plan.bedrooms), fontSize: 18, bold: true, color: '#0f172a' }, { text: '卧室', fontSize: 9, color: '#64748b', margin: [0, 2, 0, 0] }], alignment: 'center' },
        { stack: [{ text: String(plan.bathrooms), fontSize: 18, bold: true, color: '#0f172a' }, { text: '浴室', fontSize: 9, color: '#64748b', margin: [0, 2, 0, 0] }], alignment: 'center' },
        { stack: [{ text: String(plan.stories), fontSize: 18, bold: true, color: '#0f172a' }, { text: '层数', fontSize: 9, color: '#64748b', margin: [0, 2, 0, 0] }], alignment: 'center' },
      ],
      margin: [0, 0, 0, 12],
    });

    // ── Cost ──────────────────────────────────────────────────
    content.push({
      text: [
        { text: '预估造价：', color: '#475569', fontSize: 12 },
        { text: `$${plan.estimatedCost.toLocaleString()}`, color, fontSize: 14, bold: true },
      ],
      margin: [0, 0, 0, 14],
    });

    // ── Description ───────────────────────────────────────────
    content.push({ text: '方案描述', style: 'sectionTitle', margin: [0, 0, 0, 5] });
    content.push({ text: plan.description, style: 'body', margin: [0, 0, 0, 12] });

    // ── Highlights ────────────────────────────────────────────
    content.push({ text: '核心亮点', style: 'sectionTitle', margin: [0, 0, 0, 5] });
    content.push({
      ul: plan.highlights,
      style: 'body',
      margin: [0, 0, 0, 12],
    });

    // ── Features ──────────────────────────────────────────────
    content.push({ text: '主要特点', style: 'sectionTitle', margin: [0, 0, 0, 5] });
    content.push({
      text: plan.features.join('  ·  '),
      fontSize: 10,
      color: '#1d4ed8',
      margin: [0, 0, 0, 12],
    });

    // ── Room breakdown ────────────────────────────────────────
    content.push({ text: '房间分布', style: 'sectionTitle', margin: [0, 0, 0, 5] });
    content.push({
      table: {
        widths: ['*', 'auto'],
        body: [
          [
            { text: '房间', fontSize: 9, bold: true, color: '#64748b', border: [false, false, false, true] },
            { text: '面积', fontSize: 9, bold: true, color: '#64748b', alignment: 'right', border: [false, false, false, true] },
          ],
          ...plan.rooms.map(r => [
            { text: r.name, fontSize: 10, color: '#475569', border: [false, false, false, false] },
            { text: `${r.sqft} sqft`, fontSize: 10, color: '#94a3b8', alignment: 'right', border: [false, false, false, false] },
          ]),
        ],
      },
      layout: {
        hLineWidth: () => 0.5,
        hLineColor: () => '#e2e8f0',
        vLineWidth: () => 0,
        paddingTop: () => 4,
        paddingBottom: () => 4,
      },
      margin: [0, 0, 0, 20],
    });

    // ── Footer ────────────────────────────────────────────────
    content.push({
      columns: [
        { text: 'Powered by SplanAI · Data: Google Maps + RentCast · splanai.com', fontSize: 8, color: '#94a3b8' },
        { text: date, fontSize: 8, color: '#94a3b8', alignment: 'right' },
      ],
      margin: [0, 0, 0, 4],
    });
    content.push({
      text: '仅供参考。数据可能变动。不构成专业建筑或法律建议。',
      fontSize: 7,
      color: '#cbd5e1',
      alignment: 'center',
      margin: [0, 0, 0, 0],
    });

    if (!isLast) content.push({ text: '', pageBreak: 'after' });
  });

  return {
    pageSize: 'A4',
    pageMargins: [40, 30, 40, 30],
    defaultStyle: { font: defaultFont, fontSize: 11, lineHeight: 1.5 },
    styles: {
      sectionTitle: { fontSize: 9, bold: true, color: '#94a3b8', letterSpacing: 1 },
      body: { fontSize: 11, color: '#475569', lineHeight: 1.6 },
    },
    content,
  };
}

async function generatePdfBuffer(docDef: object, fonts: Record<string, object>): Promise<Buffer> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const PdfPrinter = require('pdfmake/js/Printer').default;
  const printer = new PdfPrinter(fonts);
  const pdfDoc = printer.createPdfKitDocument(docDef);

  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    pdfDoc.on('data', (chunk: Buffer) => chunks.push(chunk));
    pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
    pdfDoc.on('error', reject);
    pdfDoc.end();
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { planData?: PlanData[]; language?: string };
    const { planData, language } = body;

    if (!planData || !Array.isArray(planData) || language !== 'zh') {
      return NextResponse.json({ error: 'planData[] and language:"zh" are required' }, { status: 400 });
    }

    const { fonts, defaultFont } = getFonts();
    const docDef = buildDocDefinition(planData, defaultFont);
    const buffer = await generatePdfBuffer(docDef, fonts);

    return new NextResponse(buffer as unknown as BodyInit, {
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
