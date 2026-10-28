import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFilmstripFilename, signFilmstripFiles } from './filmstrip-storage.js';
import { visualCaptureSchedule } from './visual-capture.js';

test('stored desktop/mobile WebP and PNG frames pass filename validation', () => {
  assert.deepEqual(parseFilmstripFilename('mobile-00-250.webp'), { profile: 'mobile', index: 0, timing_ms: 250, format: 'webp' });
  assert.deepEqual(parseFilmstripFilename('desktop-10-5200.png'), { profile: 'desktop', index: 10, timing_ms: 5200, format: 'png' });
  assert.equal(parseFilmstripFilename('mobile-00-250-thumb.webp'), null);
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
