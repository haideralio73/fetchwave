/**
 * yt-dlp engine: capability probe, metadata extraction, and download jobs
 * with machine-readable progress streaming.
 */
import { spawn, execFile } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/**
 * Finds a helper binary: an explicit override first, then a copy dropped into
 * the project's own bin/ folder (handy for a portable, no-install setup),
 * then whatever is on PATH.
 */
function resolveBinary(envVar, name) {
  if (process.env[envVar]) return process.env[envVar];

  const exe = process.platform === 'win32' ? `${name}.exe` : name;
  const local = path.join(HERE, '..', 'bin', exe);
  try {
    if (fs.existsSync(local)) return local;
  } catch { /* unreadable path — fall through to PATH */ }

  return name; // let the OS resolve it from PATH
}

const YTDLP = resolveBinary('YTDLP_PATH', 'yt-dlp');
const FFMPEG = resolveBinary('FFMPEG_PATH', 'ffmpeg');

// If ffmpeg came from our own bin folder, yt-dlp needs to be told where it is.
const BUNDLED_FFMPEG_DIR = FFMPEG !== 'ffmpeg' && path.isAbsolute(FFMPEG)
  ? path.dirname(FFMPEG)
  : null;

// Sentinels injected into yt-dlp's output so parsing never depends on its
// human-readable progress bar, which changes between releases.
const PROG = '@@P@@';
const FILE = '@@F@@';
const SEP = String.fromCharCode(31); // ASCII unit separator - never occurs in yt-dlp field values
const PROGRESS_TEMPLATE =
  `download:${PROG}%(progress.downloaded_bytes)s${SEP}%(progress.total_bytes)s${SEP}` +
  `%(progress.total_bytes_estimate)s${SEP}%(progress.speed)s${SEP}%(progress.eta)s${SEP}%(progress.status)s`;

const num = (v) => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  if (!s || s === 'NA' || s === 'None' || s === 'null') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

/* ------------------------------------------------------------------ *
 * Platform detection
 * ------------------------------------------------------------------ */

const PLATFORMS = [
  { id: 'youtube',     label: 'YouTube',     test: /(^|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com)$/i },
  { id: 'tiktok',      label: 'TikTok',      test: /(^|\.)(tiktok\.com)$/i },
  { id: 'instagram',   label: 'Instagram',   test: /(^|\.)(instagram\.com|instagr\.am)$/i },
  { id: 'facebook',    label: 'Facebook',    test: /(^|\.)(facebook\.com|fb\.watch|fb\.com)$/i },
  { id: 'snapchat',    label: 'Snapchat',    test: /(^|\.)(snapchat\.com)$/i },
  { id: 'x',           label: 'X',           test: /(^|\.)(twitter\.com|x\.com|t\.co)$/i },
  { id: 'reddit',      label: 'Reddit',      test: /(^|\.)(reddit\.com|redd\.it)$/i },
  { id: 'vimeo',       label: 'Vimeo',       test: /(^|\.)vimeo\.com$/i },
  { id: 'twitch',      label: 'Twitch',      test: /(^|\.)(twitch\.tv)$/i },
  { id: 'pinterest',   label: 'Pinterest',   test: /(^|\.)(pinterest\.[a-z.]+|pin\.it)$/i },
  { id: 'dailymotion', label: 'Dailymotion', test: /(^|\.)(dailymotion\.com|dai\.ly)$/i },
  { id: 'soundcloud',  label: 'SoundCloud',  test: /(^|\.)soundcloud\.com$/i },
];

export function detectPlatform(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./i, '');
    const hit = PLATFORMS.find((p) => p.test.test(host));
    if (hit) return { id: hit.id, label: hit.label };
    return { id: 'generic', label: host };
  } catch {
    return { id: 'generic', label: 'Link' };
  }
}

/** Pull every http(s) URL out of a blob of pasted text. */
export function extractUrls(text) {
  const found = String(text || '').match(/https?:\/\/[^\s<>"'`\])]+/gi) || [];
  const seen = new Set();
  const out = [];
  for (let u of found) {
    u = u.replace(/[.,;:!?]+$/, '');
    if (seen.has(u)) continue;
    seen.add(u);
    out.push(u);
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Capability probe
 * ------------------------------------------------------------------ */

function version(bin, args) {
  return new Promise((resolve) => {
    execFile(bin, args, { timeout: 20000, windowsHide: true }, (err, stdout) => {
      if (err) return resolve(null);
      resolve(String(stdout).trim().split('\n')[0].slice(0, 120));
    });
  });
}

/**
 * Feature flags discovered once at boot.
 * jsRuntime: recent yt-dlp needs a JavaScript runtime to solve YouTube's
 * player challenges. We *are* a Node process, so we can always hand it our
 * own interpreter by absolute path — no separate Deno install required.
 */
export const caps = { jsRuntime: false };

function helpText() {
  return new Promise((resolve) => {
    execFile(YTDLP, ['--help'], { timeout: 20000, windowsHide: true, maxBuffer: 4 << 20 },
      (err, stdout) => resolve(err ? '' : String(stdout)));
  });
}

let probeCache = null;

/** Shelling out to --version/--help is slow, so only do it once. */
export async function probe({ refresh = false } = {}) {
  if (probeCache && !refresh) return probeCache;

  const [ytdlp, ffmpeg, help] = await Promise.all([
    version(YTDLP, ['--version']),
    version(FFMPEG, ['-version']),
    helpText(),
  ]);

  caps.jsRuntime = /--js-runtimes/.test(help);

  probeCache = {
    ytdlp: { ok: !!ytdlp, version: ytdlp },
    ffmpeg: {
      ok: !!ffmpeg,
      version: ffmpeg ? (ffmpeg.match(/ffmpeg version (\S+)/) || [, ffmpeg])[1] : null,
    },
    jsRuntime: caps.jsRuntime,
  };
  return probeCache;
}

/** Flags every yt-dlp invocation should carry. */
function engineArgs() {
  const args = [];

  if (caps.jsRuntime) {
    // Hand yt-dlp this very Node binary by absolute path, so YouTube's player
    // challenge can be solved even when `node` isn't on the PATH yt-dlp sees.
    args.push('--js-runtimes', `node:${process.execPath}`);
  }
  if (BUNDLED_FFMPEG_DIR) args.push('--ffmpeg-location', BUNDLED_FFMPEG_DIR);

  return args;
}

/* ------------------------------------------------------------------ *
 * Metadata
 * ------------------------------------------------------------------ */

function cookieArgs(settings) {
  const b = settings && settings.cookiesFromBrowser;
  if (b && b !== 'none') return ['--cookies-from-browser', b];
  return [];
}

function runJson(args, { timeout = 90000 } = {}) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(YTDLP, args, { windowsHide: true });
    } catch (e) {
      return reject(new Error(e.message));
    }
    let out = '';
    let err = '';
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; killTree(child); }, timeout);

    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err = (err + d).slice(-8000); });
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(new Error(e.code === 'ENOENT' ? 'yt-dlp is not installed or not on PATH.' : e.message));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) return reject(new Error('Timed out while reading that link.'));
      if (code !== 0 || !out.trim()) {
        return reject(new Error(cleanError(err, args[args.length - 1]) || 'yt-dlp exited with code ' + code));
      }
      try {
        resolve(JSON.parse(out));
      } catch {
        reject(new Error('Could not parse the response from yt-dlp.'));
      }
    });
  });
}

/**
 * Turn yt-dlp's stderr into one human sentence.
 * `url` is used to identify the platform — yt-dlp writes its `[youtube] …`
 * progress lines to stdout, so stderr alone can't tell us where we were.
 */
function cleanError(stderr, url) {
  const lines = String(stderr || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => !/^WARNING:/i.test(l));
  const errLine = lines.slice().reverse().find((l) => /^ERROR:/i.test(l)) || lines[0] || '';
  let msg = errLine.replace(/^ERROR:\s*/i, '').trim();

  const all = String(stderr || '');

  if (/Unsupported URL/i.test(msg)) return 'That link is not supported.';

  if (/HTTP Error 429|rate.?limit/i.test(msg)) {
    return 'Rate-limited by the site. Wait a minute and try again.';
  }

  // YouTube now gates most formats behind a "PO token". Without a provider
  // the media URLs come back 403 even though metadata reads fine.
  const isYouTube = url ? detectPlatform(url).id === 'youtube' : /youtube/i.test(all);
  if (/PO Token|po_token|GVS/i.test(all) || (/403/.test(msg) && isYouTube)) {
    return 'YouTube refused the video data (403). It now requires a proof-of-origin token: ' +
           'turn on "Use cookies from browser" in Settings, or set up a PO token provider. ' +
           'See the README section "Making YouTube work".';
  }

  // TikTok answers unknown clients with a WAF challenge page rather than the
  // video, which surfaces as "Unexpected response from webpage request".
  if (/Unexpected response from webpage/i.test(msg) &&
      (url ? detectPlatform(url).id === 'tiktok' : /tiktok/i.test(all))) {
    return 'TikTok served a bot check instead of the video. Turn on "Use cookies from browser" ' +
           'in Settings (close that browser first) — a real session usually passes it.';
  }

  if (/login|cookies|sign in|private|not available in your|age.?restrict/i.test(msg)) {
    msg += ' — this post may be private or login-gated. Try turning on browser cookies in Settings.';
  }

  return msg.slice(0, 400);
}

const HEIGHT_LABEL = {
  4320: '8K', 2160: '4K', 1440: '2K', 1080: '1080p',
  720: '720p', 480: '480p', 360: '360p', 240: '240p', 144: '144p',
};

function buildQualityOptions(info) {
  const formats = Array.isArray(info.formats) ? info.formats : [];
  const byHeight = new Map();

  for (const f of formats) {
    if (!f || f.vcodec === 'none' || !f.height) continue;
    const size = num(f.filesize) != null ? num(f.filesize) : num(f.filesize_approx);
    const tbr = num(f.tbr) || 0;
    const prev = byHeight.get(f.height);
    if (!prev || tbr > prev.tbr) byHeight.set(f.height, { tbr, size });
  }

  // Best audio stream size, added to video-only estimates.
  let audioSize = 0;
  for (const f of formats) {
    if (!f || f.acodec === 'none' || f.vcodec !== 'none') continue;
    const s = num(f.filesize) != null ? num(f.filesize) : num(f.filesize_approx);
    if (s && s > audioSize) audioSize = s;
  }

  const options = [...byHeight.keys()]
    .sort((a, b) => b - a)
    .map((h) => {
      const f = byHeight.get(h);
      return {
        id: 'h' + h,
        kind: 'video',
        height: h,
        label: HEIGHT_LABEL[h] || h + 'p',
        size: f.size ? f.size + audioSize : null,
      };
    });

  if (!options.length) {
    options.push({ id: 'best', kind: 'video', height: null, label: 'Best available', size: null });
  }
  return options;
}

function pickThumb(info) {
  if (info.thumbnail) return info.thumbnail;
  const thumbs = Array.isArray(info.thumbnails) ? info.thumbnails : [];
  if (!thumbs.length) return null;
  const sorted = thumbs.slice().sort((a, b) => (num(b.width) || 0) - (num(a.width) || 0));
  return (sorted[0] && sorted[0].url) || null;
}

export async function fetchInfo(url, settings = {}) {
  const args = [
    '--ignore-config', '--no-warnings', '--no-colors',
    '--no-playlist', '--flat-playlist',
    '-J',
    ...engineArgs(),
    ...cookieArgs(settings),
    url,
  ];
  const info = await runJson(args);

  if (info._type === 'playlist' && Array.isArray(info.entries)) {
    const entries = info.entries
      .filter(Boolean)
      .map((e) => ({
        url: e.webpage_url || e.url || (e.id ? 'https://www.youtube.com/watch?v=' + e.id : null),
        title: e.title || 'Untitled',
        duration: num(e.duration),
        thumbnail: pickThumb(e),
      }))
      .filter((e) => e.url);

    return {
      kind: 'playlist',
      title: info.title || 'Playlist',
      uploader: info.uploader || info.channel || null,
      count: entries.length,
      entries,
      platform: detectPlatform(url),
    };
  }

  return {
    kind: 'video',
    url: info.webpage_url || url,
    id: info.id || null,
    title: info.title || 'Untitled',
    uploader: info.uploader || info.channel || info.uploader_id || null,
    duration: num(info.duration),
    thumbnail: pickThumb(info),
    viewCount: num(info.view_count),
    likeCount: num(info.like_count),
    uploadDate: info.upload_date || null,
    extractor: info.extractor_key || info.extractor || null,
    isLive: !!info.is_live,
    platform: detectPlatform(info.webpage_url || url),
    qualities: buildQualityOptions(info),
  };
}

/* ------------------------------------------------------------------ *
 * Download jobs
 * ------------------------------------------------------------------ */

function killTree(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    // yt-dlp spawns ffmpeg; kill the whole tree or the merge keeps running.
    try {
      const t = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
        windowsHide: true, stdio: 'ignore',
      });
      t.on('error', () => { try { child.kill('SIGKILL'); } catch {} });
    } catch {
      try { child.kill('SIGKILL'); } catch {}
    }
  } else {
    try { child.kill('SIGKILL'); } catch {}
  }
}

function formatSelector(quality) {
  if (!quality || quality === 'best') return 'bv*+ba/b';
  const h = Number(String(quality).replace(/^h/, ''));
  if (!Number.isFinite(h)) return 'bv*+ba/b';
  return `bv*[height<=${h}]+ba/b[height<=${h}]/bv*+ba/b`;
}

function buildArgs(job, settings) {
  const outTemplate = path.join(job.dir, '%(title).150B [%(id)s].%(ext)s');
  const args = [
    '--ignore-config', '--no-colors', '--newline', '--no-warnings',
    '--no-playlist',
    '--windows-filenames',
    '--retries', '5',
    '--fragment-retries', '10',
    '--concurrent-fragments', '4',
    '--progress', '--progress-template', PROGRESS_TEMPLATE,
    '--no-simulate', '--print', 'after_move:' + FILE + '%(filepath)s',
    '-o', outTemplate,
    '--embed-metadata',
    ...engineArgs(),
    ...cookieArgs(settings),
  ];

  if (job.quality === 'audio') {
    args.push('-x', '--audio-format', 'mp3', '--audio-quality', '0', '--embed-thumbnail');
  } else {
    args.push('-f', formatSelector(job.quality), '--merge-output-format', 'mp4');
    if (settings && settings.embedSubs) {
      args.push('--embed-subs', '--sub-langs', 'en.*,-live_chat');
    }
  }

  args.push(job.url);
  return args;
}

export class DownloadManager extends EventEmitter {
  constructor({ maxConcurrent = 3 } = {}) {
    super();
    this.jobs = new Map();
    this.queue = [];
    this.active = new Set();
    this.maxConcurrent = maxConcurrent;
    this.settings = {};
  }

  setSettings(settings) { this.settings = settings || {}; }

  list() {
    return [...this.jobs.values()].map((j) => this.toPublic(j));
  }

  toPublic(j) {
    const { child, canceling, ...rest } = j;
    return rest;
  }

  emitJob(job) { this.emit('job', this.toPublic(job)); }

  add({ url, quality, dir, title, thumbnail, platform, duration }) {
    const job = {
      id: randomUUID(),
      url,
      quality: quality || 'best',
      dir,
      title: title || url,
      thumbnail: thumbnail || null,
      platform: platform || detectPlatform(url),
      duration: duration == null ? null : duration,
      status: 'queued', // queued | downloading | processing | done | error | canceled
      percent: 0,
      downloaded: 0,
      total: null,
      speed: null,
      eta: null,
      filepath: null,
      error: null,
      createdAt: Date.now(),
      startedAt: null,
      finishedAt: null,
      child: null,
      canceling: false,
    };
    this.jobs.set(job.id, job);
    this.queue.push(job.id);
    this.emitJob(job);
    this.pump();
    return this.toPublic(job);
  }

  cancel(id) {
    const job = this.jobs.get(id);
    if (!job || job.status === 'done') return false;
    if (job.child) {
      job.canceling = true;
      killTree(job.child);
    } else {
      this.queue = this.queue.filter((q) => q !== id);
      job.status = 'canceled';
      job.finishedAt = Date.now();
      this.emitJob(job);
    }
    return true;
  }

  retry(id) {
    const job = this.jobs.get(id);
    if (!job || this.active.has(id)) return false;
    Object.assign(job, {
      status: 'queued', percent: 0, downloaded: 0, total: null,
      speed: null, eta: null, error: null, finishedAt: null, canceling: false,
    });
    this.queue.push(id);
    this.emitJob(job);
    this.pump();
    return true;
  }

  remove(id) {
    const job = this.jobs.get(id);
    if (!job) return false;
    if (this.active.has(id)) this.cancel(id);
    this.queue = this.queue.filter((q) => q !== id);
    this.jobs.delete(id);
    this.emit('removed', id);
    return true;
  }

  clearFinished() {
    for (const job of [...this.jobs.values()]) {
      if (job.status === 'done' || job.status === 'error' || job.status === 'canceled') {
        this.remove(job.id);
      }
    }
  }

  pump() {
    while (this.active.size < this.maxConcurrent && this.queue.length) {
      const id = this.queue.shift();
      const job = this.jobs.get(id);
      if (!job || job.status !== 'queued') continue;
      this.run(job);
    }
  }

  run(job) {
    this.active.add(job.id);
    job.status = 'downloading';
    job.startedAt = Date.now();
    this.emitJob(job);

    const args = buildArgs(job, this.settings);
    let child;
    try {
      child = spawn(YTDLP, args, { windowsHide: true });
    } catch (e) {
      this.fail(job, e.message);
      return;
    }
    job.child = child;

    let stderr = '';
    let stdoutTail = '';
    let lastEmit = 0;

    const onLine = (line) => {
      if (line.startsWith(PROG)) {
        const parts = line.slice(PROG.length).split(SEP);
        const dl = num(parts[0]) || 0;
        const tot = num(parts[1]) != null ? num(parts[1]) : num(parts[2]);
        const status = parts[5];
        job.downloaded = dl;
        job.total = tot;
        job.speed = num(parts[3]);
        job.eta = num(parts[4]);
        if (tot) job.percent = Math.min(99.9, (dl / tot) * 100);

        if (status === 'finished') {
          job.percent = 100;
          job.speed = null;
          job.eta = null;
          if (job.status === 'downloading') job.status = 'processing';
          lastEmit = Date.now();
          this.emitJob(job);
          return;
        }
        // Throttle: progress fires many times per second.
        const now = Date.now();
        if (now - lastEmit > 220) {
          lastEmit = now;
          this.emitJob(job);
        }
        return;
      }

      const fileIdx = line.indexOf(FILE);
      if (fileIdx !== -1) {
        job.filepath = line.slice(fileIdx + FILE.length).trim();
        return;
      }

      if (/^\[(Merger|ExtractAudio|ffmpeg|VideoConvertor|EmbedThumbnail|Metadata|FixupM3u8)\]/i.test(line)) {
        if (job.status === 'downloading') {
          job.status = 'processing';
          job.percent = 100;
          this.emitJob(job);
        }
      }
    };

    let buf = '';
    child.stdout.on('data', (chunk) => {
      buf += chunk;
      const lines = buf.split(/\r?\n/);
      buf = lines.pop() || '';
      for (const l of lines) if (l.trim()) onLine(l.trim());
      stdoutTail = (stdoutTail + chunk).slice(-4000);
    });
    child.stderr.on('data', (d) => { stderr = (stderr + d).slice(-8000); });

    child.on('error', (e) => {
      this.fail(job, e.code === 'ENOENT' ? 'yt-dlp is not installed or not on PATH.' : e.message);
    });

    child.on('close', (code) => {
      if (buf.trim()) onLine(buf.trim());
      job.child = null;
      this.active.delete(job.id);
      job.speed = null;
      job.eta = null;

      if (job.canceling) {
        job.status = 'canceled';
        job.finishedAt = Date.now();
        this.emitJob(job);
      } else if (code === 0) {
        job.status = 'done';
        job.percent = 100;
        job.finishedAt = Date.now();
        if (!job.filepath) {
          const m = stdoutTail.match(/\[download\] (.+?) has already been downloaded/);
          if (m) job.filepath = m[1].trim();
        }
        this.emitJob(job);
        this.emit('completed', this.toPublic(job));
      } else {
        this.fail(job, cleanError(stderr, job.url) || 'Download failed (exit code ' + code + ')');
        return;
      }
      this.pump();
    });
  }

  fail(job, message) {
    job.child = null;
    this.active.delete(job.id);
    job.status = 'error';
    job.error = message;
    job.speed = null;
    job.eta = null;
    job.finishedAt = Date.now();
    this.emitJob(job);
    this.pump();
  }
}
