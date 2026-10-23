import { chromium } from 'playwright';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const base = process.env.VISUAL_REVIEW_BASE_URL || 'http://127.0.0.1:4173';
const output = resolve('artifacts/visual-review');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const sizes = [
  { label: '1280', width: 1280, height: 900 },
  { label: '820', width: 820, height: 1000 },
  { label: '390', width: 390, height: 844 }
];

try {
  for (const size of sizes) {
    const capture = async (url, filename) => {
      const page = await browser.newPage({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: 1 });
      await page.addInitScript(() => { if (location.origin === 'http://127.0.0.1:4173') localStorage.setItem('africalatency_analytics_consent_v1', 'rejected'); });
      await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
      await page.evaluate(() => document.fonts ? document.fonts.ready.then(() => true) : true);
      await page.waitForTimeout(350);
      const word = await page.$('[data-rotating-word]');
      if (word) await word.evaluate(el => { el.textContent = 'AI-Built'; el.setAttribute('aria-label', 'AI-Built'); });
      const buffer = await page.screenshot({ fullPage: true, animations: 'disabled' });
      const viewportBuffer = await page.screenshot({ fullPage: false, animations: 'disabled' });
      await page.close();
      await import('node:fs/promises').then(fs => Promise.all([
        fs.writeFile(resolve(output, filename), buffer),
        fs.writeFile(resolve(output, filename.replace('.png', '-viewport.png')), viewportBuffer)
      ]));
      return buffer;
    };
    const reference = await capture(base + '/docs/visual-review/reference.html', 'reference-' + size.label + '.png');
    const homepage = await capture(base + '/', 'homepage-' + size.label + '.png');
    const comparison = await browser.newPage({
      viewport: { width: size.width * 2, height: size.height },
      deviceScaleFactor: 1
    });
    await comparison.setContent(`<!doctype html><html><head><style>*{box-sizing:border-box}html,body{margin:0;background:#161619;color:#fff;font:14px system-ui}.pair{display:grid;grid-template-columns:${size.width}px ${size.width}px;align-items:start;gap:0}.item{min-width:0}.label{height:32px;padding:8px 10px;background:#222;color:#fff;font-weight:600}img{display:block;width:${size.width}px;height:auto}</style></head><body><div class="pair"><div class="item"><div class="label">REFERENCE · ${size.width}px</div><img src="data:image/png;base64,${reference.toString('base64')}" alt="Reference"></div><div class="item"><div class="label">AFRICALATENCY · ${size.width}px</div><img src="data:image/png;base64,${homepage.toString('base64')}" alt="AfricaLatency"></div></div></body></html>`);
    await comparison.screenshot({ path: resolve(output, 'comparison-' + size.label + '.png'), fullPage: true, animations: 'disabled' });
    await comparison.close();
  }
} finally {
  await browser.close();
}
console.log('Captured viewport screenshots, full-page screenshots, and side-by-side comparisons at 1280px, 820px, and 390px.');
