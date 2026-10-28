import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFilmstripFilename, signFilmstripFiles } from './filmstrip-storage.js';
import { visualCaptureSchedule } from './visual-capture.js';

test('stored desktop/mobile WebP and PNG frames pass filename validation', () => {
  assert.deepEqual(parseFilmstripFilename('mobile-00-250.webp'), { profile: 'mobile', index: 0, timing_ms: 250, label: '', format: 'webp', overlayDetected: false });
  assert.deepEqual(parseFilmstripFilename('desktop-10-5200.png'), { profile: 'desktop', index: 10, timing_ms: 5200, label: '', format: 'png', overlayDetected: false });
  assert.equal(parseFilmstripFilename('mobile-00-250-thumb.webp'), null);
  assert.equal(parseFilmstripFilename('mobile-00-250-640.webp'), null);
  assert.equal(parseFilmstripFilename('other-00-250.webp'), null);
});

test('valid stored frames are signed; invalid names are skipped', async () => {
  const calls = [];
  const storage = { createSignedUrl: async (path, ttl) => {
    calls.push({ path, ttl });
    return path.endsWith('-thumb.webp') || path.endsWith('-640.webp')
      ? { data: { signedUrl: 'https://storage.test/' + encodeURIComponent(path) }, error: null }
      : { data: { signedUrl: 'https://storage.test/full.webp' }, error: null };
  }};
  const frames = await signFilmstripFiles([{ name: 'mobile-00-250.webp' }, { name: 'bad-name.webp' }], storage, 'job-1');
  assert.equal(frames.length, 1);
  assert.equal(frames[0].url, 'https://storage.test/full.webp');
  assert.equal(frames[0].thumbnailUrl, 'https://storage.test/job-1%2Ffilmstrip%2Fmobile-00-250-thumb.webp');
  assert.ok(calls.some(call => call.path === 'job-1/filmstrip/mobile-00-250.webp'));
  assert.ok(calls.every(call => call.ttl === 3600));
});

test('visual capture schedule contains the seven required timed frames', () => {
  assert.deepEqual(visualCaptureSchedule().map(frame => frame.timingMs), [250, 500, 1000, 1500, 2000, 3000, 5000]);
});

test('empty and malformed storage listings return no frames', async () => {
  const storage = { createSignedUrl: async () => ({ data: null, error: new Error('missing') }) };
  assert.deepEqual(await signFilmstripFiles([], storage, 'job-empty'), []);
  assert.deepEqual(await signFilmstripFiles(null, storage, 'job-empty'), []);
  assert.deepEqual(await signFilmstripFiles([{ name: '../escape.webp' }, { name: 'desktop-00-100.webp' }], storage, 'job-empty'), []);
});

test('partial signing failure keeps successfully signed frames', async () => {
  const storage = { createSignedUrl: async path => path.includes('desktop')
    ? { data: null, error: new Error('expired/missing object') }
    : path.endsWith('-thumb.webp') || path.endsWith('-640.webp')
      ? { data: null, error: new Error('thumbnail missing') }
      : { data: { signedUrl: 'https://storage.test/frame.webp' }, error: null } };
  const frames = await signFilmstripFiles([{ name: 'mobile-00-250.webp' }, { name: 'desktop-01-500.webp' }], storage, 'job-partial');
  assert.equal(frames.length, 1);
  assert.equal(frames[0].url, 'https://storage.test/frame.webp');
  assert.equal(frames[0].thumbnailUrl, frames[0].url);
});

test('overlay flag is preserved in stored filename metadata', () => {
  assert.equal(parseFilmstripFilename('mobile-00-250-fcp-overlay.webp').overlayDetected, true);
  assert.equal(parseFilmstripFilename('desktop-02-1000-lcp.webp').overlayDetected, false);
});

test('signed frame URLs can be regenerated after an expiry by repeating the signing lookup', async () => {
  let generation = 0;
  const storage = { createSignedUrl: async path => {
    if (path.endsWith('-thumb.webp') || path.endsWith('-640.webp')) return { data: null, error: new Error('optional derivative absent') };
    generation++;
    return { data: { signedUrl: 'https://storage.test/frame-' + generation + '.webp' }, error: null };
  }};
  const files = [{ name: 'mobile-00-250.webp' }];
  const expired = await signFilmstripFiles(files, storage, 'job-expire');
  const refreshed = await signFilmstripFiles(files, storage, 'job-expire');
  assert.equal(expired[0].url, 'https://storage.test/frame-1.webp');
  assert.equal(refreshed[0].url, 'https://storage.test/frame-2.webp');
});
