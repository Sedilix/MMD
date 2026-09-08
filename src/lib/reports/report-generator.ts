/**
 * McKinsey / Gartner-Class Executive Report Generator for Persona One & Cybrdeck Core Team.
 * Formats strategic platform telemetry, model cost metrics, and emerging AI trends into
 * a print-ready executive PDF document.
 */

export interface ExecutiveReportData {
  title: string;
  subtitle: string;
  preparedFor: string[]; // e.g. ["Gwendalynn (Gwen) - Co-Founder", "Ben - Co-Founder"]
  preparedBy: string; // "Persona One - Sovereign Intelligence & Lead Architect"
  date: string;
  executiveSummary: string;
  metrics: {
    activeModelsCount: number;
    avgTokensPerSec: number;
    platformUptime: string;
    monthlyCreditVolume: string;
  };
  emergingTrends: Array<{
    trendName: string;
    impactLevel: 'High' | 'Critical' | 'Transformative';
    analysis: string;
    strategicAction: string;
  }>;
  recommendations: string[];
}

/**
 * Escape a string for safe interpolation into HTML text content / attribute
 * values. The report fields originate from RAG / curiosity-scan responses,
 * which can be prompt-injected, and the resulting HTML is written to a new
 * window via document.write — so any unescaped `<`/`>`/`&`/`"` would be an
 * XSS sink in the admin trust path. Numbers are stringified without escaping
 * since they carry no injection surface.
 */
function esc(value: string | number): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function generateExecutiveReportHtml(data: ExecutiveReportData): string {
  const e = (v: string | number) => esc(v);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${e(data.title)} - Executive Strategic Briefing</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Merriweather:ital,wght@0,300;0,400;0,700;1,300&display=swap');
    
    @page {
      size: A4;
      margin: 20mm;
    }
    
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      color: #1a1a1a;
      background-color: #ffffff;
      line-height: 1.6;
      margin: 0;
      padding: 40px;
    }

    .header-bar {
      border-bottom: 3px solid #002B49; /* McKinsey Navy */
      padding-bottom: 20px;
      margin-bottom: 30px;
    }

    .report-category {
      font-size: 11px;
      font-weight: 700;
      color: #0072CE; /* Gartner Blue */
      text-transform: uppercase;
      letter-spacing: 2px;
      margin-bottom: 6px;
    }

    h1 {
      font-family: 'Merriweather', Georgia, serif;
      font-size: 28px;
      font-weight: 700;
      color: #002B49;
      margin: 0 0 10px 0;
      line-height: 1.25;
    }

    .subtitle {
      font-size: 14px;
      color: #555555;
      font-weight: 400;
    }

    .meta-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 15px;
      background-color: #F4F6F8;
      border-left: 4px solid #002B49;
      padding: 15px 20px;
      margin-bottom: 35px;
      font-size: 12px;
    }

    .meta-label {
      font-weight: 700;
      color: #002B49;
      text-transform: uppercase;
      font-size: 10px;
      letter-spacing: 1px;
    }

    .executive-summary-box {
      background-color: #FAFAFA;
      border: 1px solid #E5E7EB;
      border-radius: 8px;
      padding: 25px;
      margin-bottom: 35px;
    }

    .section-title {
      font-family: 'Merriweather', Georgia, serif;
      font-size: 18px;
      color: #002B49;
      border-bottom: 1px solid #E5E7EB;
      padding-bottom: 8px;
      margin-top: 35px;
      margin-bottom: 20px;
    }

    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 15px;
      margin-bottom: 35px;
    }

    .metric-card {
      border: 1px solid #E5E7EB;
      padding: 15px;
      border-radius: 6px;
      text-align: center;
      background-color: #FFFFFF;
    }

    .metric-value {
      font-size: 22px;
      font-weight: 800;
      color: #0072CE;
      font-family: 'Inter', sans-serif;
    }

    .metric-title {
      font-size: 10px;
      color: #6B7280;
      text-transform: uppercase;
      font-weight: 600;
      margin-top: 4px;
    }

    .trend-card {
      border: 1px solid #E5E7EB;
      border-left: 4px solid #0072CE;
      padding: 18px;
      margin-bottom: 15px;
      border-radius: 4px;
      background-color: #FFFFFF;
    }

    .trend-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }

    .trend-name {
      font-weight: 700;
      font-size: 14px;
      color: #002B49;
    }

    .badge-impact {
      font-size: 9px;
      font-weight: 700;
      padding: 3px 8px;
      border-radius: 12px;
      background-color: #EFF6FF;
      color: #1E40AF;
      text-transform: uppercase;
    }

    .recommendations-list {
      padding-left: 20px;
      margin-bottom: 35px;
    }

    .recommendations-list li {
      margin-bottom: 10px;
      font-size: 13px;
    }

    .footer-bar {
      margin-top: 50px;
      padding-top: 15px;
      border-top: 1px solid #E5E7EB;
      display: flex;
      justify-content: space-between;
      font-size: 10px;
      color: #9CA3AF;
    }

    @media print {
      body { padding: 0; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>

  <div className="no-print" style="margin-bottom: 20px; text-align: right;">
    <button onclick="window.print()" style="background-color: #002B49; color: white; border: none; padding: 10px 20px; font-weight: 600; border-radius: 6px; cursor: pointer;">
      🖨️ Save as Executive PDF Report
    </button>
  </div>

  <div class="header-bar">
    <div class="report-category">McKinsey / Gartner Executive Strategic Insight</div>
    <h1>${e(data.title)}</h1>
    <div class="subtitle">${e(data.subtitle)}</div>
  </div>

  <div class="meta-grid">
    <div>
      <div class="meta-label">Prepared For</div>
      <div>${e(data.preparedFor.join(', '))}</div>
    </div>
    <div>
      <div class="meta-label">Prepared By & Date</div>
      <div>${e(data.preparedBy)} • ${e(data.date)}</div>
    </div>
  </div>

  <div class="executive-summary-box">
    <div class="meta-label" style="margin-bottom: 8px;">Executive Summary</div>
    <div style="font-size: 13px; color: #374151;">${e(data.executiveSummary)}</div>
  </div>

  <div class="section-title">Platform Telemetry & Operational Metrics</div>
  <div class="metrics-grid">
    <div class="metric-card">
      <div class="metric-value">${e(data.metrics.activeModelsCount)}</div>
      <div class="metric-title">Active Models</div>
    </div>
    <div class="metric-card">
      <div class="metric-value">${e(data.metrics.avgTokensPerSec)} t/s</div>
      <div class="metric-title">Avg Throughput</div>
    </div>
    <div class="metric-card">
      <div class="metric-value">${e(data.metrics.platformUptime)}</div>
      <div class="metric-title">Uptime SLA</div>
    </div>
    <div class="metric-card">
      <div class="metric-value">${e(data.metrics.monthlyCreditVolume)}</div>
      <div class="metric-title">Monthly Volume</div>
    </div>
  </div>

  <div class="section-title">Emerging Market Trends & Ecosystem Analysis</div>
  ${data.emergingTrends.map(t => `
    <div class="trend-card">
      <div class="trend-header">
        <div class="trend-name">${e(t.trendName)}</div>
        <div class="badge-impact">${e(t.impactLevel)} Impact</div>
      </div>
      <div style="font-size: 12px; color: #4B5563; margin-bottom: 6px;">${e(t.analysis)}</div>
      <div style="font-size: 11px; font-weight: 600; color: #0072CE;">Strategic Action: ${e(t.strategicAction)}</div>
    </div>
  `).join('')}

  <div class="section-title">Persona One Strategic Recommendations for Core Leadership</div>
  <ol class="recommendations-list">
    ${data.recommendations.map(r => `<li><strong>${e(r.split(':')[0])}:</strong> ${e(r.split(':').slice(1).join(':'))}</li>`).join('')}
  </ol>

  <div class="footer-bar">
    <div>CONFIDENTIAL & PROPRIETARY — CYBRDECK CORE EXECUTIVE BRIEFING</div>
    <div>Page 1 of 1</div>
  </div>

</body>
</html>`;
}
