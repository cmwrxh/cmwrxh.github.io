import fs from 'fs/promises';
import path from 'path';
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';

function formatDate(iso) {
  return new Date(iso).toLocaleString('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Africa/Nairobi',
  });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function buildRowsHtml(perLocation) {
  return perLocation.map((row) => {
    if (row.error) {
      return `<tr><td>${escapeHtml(row.location)}</td><td colspan="5">measurement unavailable</td></tr>`;
    }
    return `<tr>
      <td>${escapeHtml(row.location)}</td>
      <td>${row.dnsMs ?? '—'}</td>
      <td>${row.tlsMs ?? '—'}</td>
      <td>${row.ttfbMs ?? '—'}</td>
      <td>${row.totalMs ?? '—'}</td>
      <td>${row.statusCode ?? '—'}</td>
    </tr>`;
  }).join('\n');
}

function fillTemplate(template, data) {
  return template
    .replaceAll('{{domain}}', escapeHtml(data.domain))
    .replaceAll('{{reference}}', escapeHtml(data.reference))
    .replaceAll('{{generatedAtFormatted}}', escapeHtml(formatDate(data.generatedAt)))
    .replaceAll('{{locationCount}}', String(data.perLocation.length))
    .replaceAll('{{locationList}}', data.perLocation.map((p) => escapeHtml(p.location)).join(', '))
    .replaceAll('{{worstLocation}}', escapeHtml(data.summary.worstLocation ?? 'n/a'))
    .replaceAll('{{worstTtfbMs}}', escapeHtml(data.summary.worstTtfbMs ?? 'n/a'))
    .replaceAll('{{bestLocation}}', escapeHtml(data.summary.bestLocation ?? 'n/a'))
    .replaceAll('{{bestTtfbMs}}', escapeHtml(data.summary.bestTtfbMs ?? 'n/a'))
    .replace('{{rowsHtml}}', buildRowsHtml(data.perLocation));
}

export async function generateReportPdf(auditResult, reference) {
  const templatePath = path.join(process.cwd(), 'templates', 'report-template.html');
  const template = await fs.readFile(templatePath, 'utf-8');
  const html = fillTemplate(template, { ...auditResult, reference });

  const browser = await puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    return await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' },
    });
  } finally {
    await browser.close();
  }
}
