/**
 * Per-platform health check.
 *
 *   npm run test:platforms
 *   npm run test:platforms -- tiktok,youtube
 *
 * Drives FetchWave's own engine (not raw yt-dlp) so the result reflects what
 * the app will actually do. Two stages per platform, because they fail
 * independently and the difference is the whole story:
 *
 *   metadata — can we read the title/formats?  (the paste box)
 *   media    — do real video bytes arrive?     (the download)
 *
 * YouTube is the classic split: metadata fine, media 403 without a PO token.
 *
 * URLs are taken from yt-dlp's own test suite. They go stale over time; each
 * platform lists several and the first one that resolves is used.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { probe, fetchInfo, DownloadManager } from '../server/ytdlp.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));

const URLS = {
  youtube: [
    'https://www.youtube.com/watch?v=YE7VzlLtp-4',
    'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
  ],
  tiktok: [
    'https://www.tiktok.com/@patroxofficial/video/6742501081818877190',
    'https://www.tiktok.com/@barudakhb_/video/6984138651336838402',
    'https://www.tiktok.com/@pokemonlife22/video/7059698374567611694',
  ],
  instagram: [
    'https://instagram.com/p/aye83DjauH/',
    'https://www.instagram.com/reel/Chunk8-jurw/',
    'https://www.instagram.com/p/BQ0eAlwhDrw/',
  ],
  facebook: [
    'https://www.facebook.com/radiokicksfm/videos/3676516585958356/',
    'https://www.facebook.com/video.php?v=274175099429670',
    'https://www.facebook.com/cnn/videos/10155529876156509/',
  ],
  snapchat: [
    'https://www.snapchat.com/spotlight/W7_EDlXWTBiXAEEniNoMPwAAYYWtidGhudGZpAX1TKn0JAX1TKnXJAAAAAA',
    'https://www.snapchat.com/spotlight/W7_EDlXWTBiXAEEniNoMPwAAYcnVjYWdwcGV1AZEaIYn5AZEaIYnrAAAAAQ',
  ],
  x: [
    'https://twitter.com/starwars/status/665052190608723968',
    'https://twitter.com/captainamerica/status/719944021058060289',
    'https://twitter.com/i/web/status/910031516746514432',
  ],
  reddit: [
    'https://www.reddit.com/r/videos/comments/6rrwyj/that_small_heart_attack/',
    'https://www.reddit.com/r/aww/comments/90bu6w/heat_index_was_110_degrees_so_we_offered_him_a/',
  ],
  vimeo: [
    'https://player.vimeo.com/video/54469442',
    'http://vimeo.com/68375962',
    'http://vimeo.com/channels/keypeele/75629013',
  ],
  dailymotion: [
    'http://www.dailymotion.com/video/x5kesuj_office-christmas-party-review-jason-bateman-olivia-munn-t-j-miller_news',
    'https://geo.dailymotion.com/player.html?video=x89eyek',
  ],
  pinterest: [
    'https://www.pinterest.com/pin/664281013778109217/',
    'https://www.pinterest.com/pin/1084663891475263837/',
  ],
  soundcloud: [
    'http://soundcloud.com/ethmusic/lostin-powers-she-so-heavy',
    'https://soundcloud.com/jaimemf/youtube-dl-test-video-a-y-baw/s-8Pjrp',
  ],
};

const BYTES_TO_PROVE_ACCESS = 128 * 1024;
const DL_TIMEOUT_MS = 75_000;
const META_TIMEOUT_MS = 90_000;

const only = (process.argv[2] || '').split(',').filter(Boolean);
const OUT = path.join(os.tmpdir(), 'fetchwave-platform-test');
fs.mkdirSync(OUT, { recursive: true });

await probe();

const manager = new DownloadManager({ maxConcurrent: 1 });
manager.setSettings({ cookiesFromBrowser: process.env.FW_TEST_COOKIES || 'none' });

/** Resolves once enough bytes arrive to prove the media URL was served. */
function tryDownload(url) {
  return new Promise((resolve) => {
    const job = manager.add({ url, quality: 'h480', dir: OUT, title: 'test' });
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      manager.off('job', onJob);
      try { manager.cancel(job.id); } catch { /* already gone */ }
      setTimeout(() => resolve(result), 150);
    };

    const timer = setTimeout(() => finish({ ok: false, note: 'timed out' }), DL_TIMEOUT_MS);

    const onJob = (j) => {
      if (j.id !== job.id) return;
      if (j.downloaded >= BYTES_TO_PROVE_ACCESS) {
        finish({ ok: true, note: `${(j.downloaded / 1024).toFixed(0)} KB received` });
      } else if (j.status === 'done') {
        finish({ ok: true, note: 'completed' });
      } else if (j.status === 'error') {
        finish({ ok: false, note: j.error });
      }
    };
    manager.on('job', onJob);
  });
}

const results = [];
const pad = (s, n) => String(s ?? '').padEnd(n);

console.log('');
console.log(pad('PLATFORM', 13) + pad('METADATA', 10) + pad('MEDIA', 9) + 'DETAIL');
console.log('-'.repeat(92));

for (const [platform, candidates] of Object.entries(URLS)) {
  if (only.length && !only.includes(platform)) continue;

  const record = { platform, meta: null, media: false, detail: '' };

  for (const url of candidates) {
    let info;
    try {
      info = await Promise.race([
        fetchInfo(url, manager.settings),
        new Promise((_, rej) => setTimeout(() => rej(new Error('metadata timed out')), META_TIMEOUT_MS)),
      ]);
    } catch (e) {
      record.detail = e.message;
      continue; // stale URL? try the next candidate
    }

    record.meta = info.title || '(untitled)';
    const dl = await tryDownload(url);
    record.media = dl.ok;
    record.detail = dl.note;
    break;
  }

  results.push(record);
  console.log(
    pad(platform, 13) +
    pad(record.meta ? 'ok' : 'FAIL', 10) +
    pad(record.media ? 'ok' : 'BLOCKED', 9) +
    String(record.detail).replace(/\s+/g, ' ').slice(0, 60),
  );
}

const passed = results.filter((r) => r.media).length;
console.log('-'.repeat(92));
console.log(`${passed}/${results.length} fully working (metadata + real media bytes)`);

if (passed < results.length) {
  console.log('');
  console.log('Blocked platforms are usually anti-bot gates, not bugs.');
  console.log('Try again with browser cookies:  FW_TEST_COOKIES=chrome npm run test:platforms');
}
console.log('');

fs.writeFileSync(path.join(HERE, 'platform-results.json'), JSON.stringify(results, null, 2));
process.exit(0);
