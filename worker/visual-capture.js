import puppeteer from 'puppeteer-core';
import { validateRedirectChain } from './url-safety.js';

const FIXED_TIMES = [250, 500, 1000, 1500, 2000, 3000, 5000];

export function visualCaptureSchedule() {
  return FIXED_TIMES.map(timingMs => ({ timingMs, label: 't+' + timingMs + 'ms' }));
}

async function captureProfile(url, profile) {
  const desktop = profile === 'desktop';
  const viewport = desktop
    ? { width: 1366, height: 768, deviceScaleFactor: 2 }
    : { width: 390, height: 844, deviceScaleFactor: 3 };
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env.CHROME_PATH || '/usr/bin/chromium',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });
  const frames = [];
  try {
    const page = await browser.newPage();
    await page.setViewport(viewport);
    await page.evaluateOnNewDocument(() => {
      window.__alVisualMilestones = { fcp: null, lcp: null };
      try {
        new PerformanceObserver(list => {
          for (const entry of list.getEntries()) if (entry.name === 'first-contentful-paint') window.__alVisualMilestones.fcp = entry.startTime;
        }).observe({ type: 'paint', buffered: true });
        new PerformanceObserver(list => {
          for (const entry of list.getEntries()) window.__alVisualMilestones.lcp = entry.startTime;
        }).observe({ type: 'largest-contentful-paint', buffered: true });
      } catch {}
    });
    const safeUrl = await validateRedirectChain(url);
    const navigationStarted = Date.now();
    await page.goto(safeUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const take = async (timingMs, label, final = false) => {
      try {
        const data = await page.screenshot({ type: final ? 'png' : 'webp', quality: final ? undefined : 90, fullPage: false, captureBeyondViewport: false });
        const overlayDetected = await page.evaluate(() => Boolean(document.querySelector('[role="dialog"], [aria-modal="true"], [id*="cookie" i], [class*="cookie" i], [class*="consent" i]')));
        frames.push({ timingMs: Math.max(0, Math.round(timingMs)), label, profile, overlayDetected, dataUrl: 'data:image/' + (final ? 'png' : 'webp') + ';base64,' + data.toString('base64') });
      } catch (error) {
        console.warn('[scan-worker] visual frame capture failed:', String(error?.message || error).slice(0, 120));
      }
    };
    for (const target of FIXED_TIMES) {
      const elapsed = Date.now() - navigationStarted;
      if (elapsed < target) await new Promise(resolve => setTimeout(resolve, target - elapsed));
      await take(target, 't+' + target + 'ms');
    }
    const milestones = await page.evaluate(() => ({
      fcp: window.__alVisualMilestones?.fcp ?? null,
      lcp: window.__alVisualMilestones?.lcp ?? null
    }));
    for (const [label, value] of [['FCP', milestones.fcp], ['LCP', milestones.lcp]]) {
      if (Number.isFinite(value)) await take(value, label);
    }
    try {
      await page.waitForFunction(() => document.readyState === 'complete', { timeout: 12000 });
      await take(Date.now() - navigationStarted, 'Load');
    } catch {}
    try {
      await page.waitForNetworkIdle({ idleTime: 700, timeout: 5000 });
    } catch {}
    await take(Date.now() - navigationStarted, 'Visually complete', true);
    return frames;
  } finally {
    await browser.close().catch(() => {});
  }
}

export async function captureVisualFilmstrip(url) {
  const frames = [];
  const errors = [];
  for (const profile of ['desktop', 'mobile']) {
    try {
      frames.push(...await captureProfile(url, profile));
    } catch (error) {
      errors.push({ profile, reason: String(error?.message || error).slice(0, 180) });
    }
  }
  return { frames, errors, partial: frames.length > 0 && errors.length > 0 };
}
