import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const base = process.env.HOMEPAGE_TEST_BASE_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch({ headless: true, channel: 'chrome' });

async function changedPixels(page) {
  return page.evaluate(() => {
    const c = document.querySelector('[data-dot-field]');
    if (!c) throw new Error('DotField canvas missing');
    const w = c.width, h = c.height;
    const off = document.createElement('canvas'); off.width = w; off.height = h;
    const ctx = off.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h); ctx.drawImage(c, 0, 0);
    const rgba = ctx.getImageData(0, 0, w, h).data;
    const current = new Uint8Array(Math.ceil(w / 2) * Math.ceil(h / 2));
    let k = 0;
    for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) {
      const i = (y * w + x) * 4;
      current[k++] = Math.round(.2126 * rgba[i] + .7152 * rgba[i + 1] + .0722 * rgba[i + 2]);
    }
    const prev = window.__dotPixelPrevious;
    let changed = 0;
    if (prev) for (let i = 0; i < current.length; i++) if (Math.abs(current[i] - prev[i]) > 10) changed++;
    window.__dotPixelPrevious = current;
    return { changed: changed * 4, sampled: current.length };
  });
}

async function motionRun(width, height, dpr = 1) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr, reducedMotion: 'no-preference' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base + '/?dotfield-test=1', { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForFunction(() => window.__AL_DOTFIELD_TEST_HOOK__);
  await page.waitForTimeout(2000);
  await changedPixels(page);
  const samples = [];
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(200);
    samples.push((await changedPixels(page)).changed);
  }
  const average = samples.reduce((a, b) => a + b, 0) / samples.length;
  const before = await page.evaluate(() => window.__AL_DOTFIELD_TEST_HOOK__.snapshot());
  await page.evaluate(() => { for (let i = 0; i < 20; i++) window.__AL_DOTFIELD_TEST_HOOK__.resize(); });
  const after = await page.evaluate(() => window.__AL_DOTFIELD_TEST_HOOK__.snapshot());
  assert.equal(after, before, 'DotField parameters must remain byte-identical after 20 resize events');
  if (width === 390 || width === 1280) assert.ok(average >= 500, width + 'px average changed pixels/step must be >= 500; got ' + Math.round(average));
  assert.deepEqual(errors, [], 'browser page errors');
  console.log(JSON.stringify({ viewport: width + 'x' + height, dpr, averageChangedPixelsPerStep: Math.round(average), resizeParametersStable: true }));
  await context.close();
}

try {
  await motionRun(390, 844);
  await motionRun(1280, 800);
  await motionRun(320, 844);
  await motionRun(390, 844, 1.5);
} finally {
  await browser.close();
}
