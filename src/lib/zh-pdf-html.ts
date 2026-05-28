export interface ZHPlanData {
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

export function buildZHHTML(plans: ZHPlanData[]): string {
  const date = new Date().toLocaleDateString('zh-CN', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  const pages = plans.map((plan, i) => {
    const color = PLAN_COLORS[i % PLAN_COLORS.length];
    const roomRows = plan.rooms
      .map(r => `<div class="room"><span>${r.name}</span><span class="muted">${r.sqft} sqft</span></div>`)
      .join('');
    const featureTags = plan.features
      .map(f => `<span class="tag">${f}</span>`)
      .join('');
    const highlightItems = plan.highlights
      .map(h => `<li>${h}</li>`)
      .join('');

    return `
<div class="page">
  <div class="hdr" style="background:${color}">
    <div class="badge">方案 ${plan.id}</div>
    <h1>${plan.name}</h1>
    <p class="style-label">${plan.style}</p>
  </div>
  <div class="body">
    <div class="stats">
      <div class="stat"><span class="val">${plan.squareFootage.toLocaleString()}</span><span class="lbl">平方英尺</span></div>
      <div class="stat"><span class="val">${plan.bedrooms}</span><span class="lbl">卧室</span></div>
      <div class="stat"><span class="val">${plan.bathrooms}</span><span class="lbl">浴室</span></div>
      <div class="stat"><span class="val">${plan.stories}</span><span class="lbl">层数</span></div>
    </div>
    <div class="cost-box" style="border-color:${color}">
      预估造价：<strong style="color:${color}">$${plan.estimatedCost.toLocaleString()}</strong>
    </div>
    <h2 class="sec">方案描述</h2>
    <p class="desc">${plan.description}</p>
    <h2 class="sec">核心亮点</h2>
    <ul class="hl">${highlightItems}</ul>
    <h2 class="sec">主要特点</h2>
    <div class="tags">${featureTags}</div>
    <h2 class="sec">房间分布</h2>
    <div class="rooms">${roomRows}</div>
  </div>
  <div class="footer">
    <span>Powered by SplanAI · Data: Google Maps + RentCast · splanai.com</span>
    <span>${date}</span>
  </div>
  <div class="disclaimer">仅供参考。数据可能变动。不构成专业建筑或法律建议。Floor-plan concepts are AI-generated for preliminary illustration only. They are not construction-ready drawings and may not comply with building codes or zoning. Verify with licensed professionals before relying on them.</div>
</div>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Noto Sans CJK SC','Noto Sans SC','PingFang SC','Microsoft YaHei',sans-serif;color:#1e293b;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.page{width:210mm;min-height:297mm;page-break-after:always;display:flex;flex-direction:column}
.hdr{color:#fff;padding:28px 24px 18px;flex-shrink:0}
.badge{font-size:10px;font-weight:700;letter-spacing:3px;opacity:.75;margin-bottom:5px;text-transform:uppercase}
h1{font-size:24px;font-weight:700;margin-bottom:3px}
.style-label{font-size:12px;opacity:.7}
.body{flex:1;padding:18px 24px 12px}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px}
.stat{background:#f8fafc;border-radius:8px;padding:10px;text-align:center}
.val{display:block;font-size:20px;font-weight:700;color:#0f172a}
.lbl{display:block;font-size:10px;color:#64748b;margin-top:2px}
.cost-box{border:1px solid;border-radius:8px;padding:9px 14px;margin-bottom:14px;font-size:12px;color:#475569;background:#f8fafc}
.sec{font-size:9px;font-weight:700;letter-spacing:2px;color:#94a3b8;text-transform:uppercase;margin:12px 0 6px;border-bottom:1px solid #f1f5f9;padding-bottom:4px}
.desc{font-size:11.5px;line-height:1.75;color:#475569}
.hl{list-style:none;display:flex;flex-direction:column;gap:3px;margin-bottom:2px}
.hl li{font-size:11.5px;color:#475569;padding-left:14px;position:relative;line-height:1.6}
.hl li::before{content:'✓';position:absolute;left:0;color:#10b981;font-weight:700}
.tags{display:flex;flex-wrap:wrap;gap:5px}
.tag{background:#eff6ff;border:1px solid #bfdbfe;border-radius:20px;padding:2px 9px;font-size:10px;color:#1d4ed8}
.rooms{display:grid;grid-template-columns:repeat(2,1fr);gap:5px}
.room{display:flex;justify-content:space-between;background:#f8fafc;border-radius:6px;padding:5px 10px;font-size:11px}
.muted{color:#94a3b8}
.footer{border-top:1px solid #e2e8f0;padding:7px 24px;display:flex;justify-content:space-between;font-size:9px;color:#94a3b8;flex-shrink:0}
.disclaimer{text-align:center;font-size:7.5px;color:#cbd5e1;padding:3px 24px 6px;flex-shrink:0}
</style>
</head>
<body>${pages}</body>
</html>`;
}
