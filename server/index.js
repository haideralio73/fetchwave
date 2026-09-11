import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { probe, fetchInfo, detectPlatform, extractUrls, DownloadManager } from './ytdlp.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');

// Settings and history live beside the app; downloads default to downloads/.
const DATA_DIR = ROOT;
const CONFIG_PATH = path.join(DATA_DIR, 'config.json');

const DEFAULT_SETTINGS = {
  downloadDir: path.join(ROOT, 'downloads'),
  defaultQuality: 'best',
  cookiesFromBrowser: 'none',
  embedSubs: false,
  maxConcurrent: 3,
};

/* ------------------------------------------------------------------ *
 * Settings
 * ------------------------------------------------------------------ */

function loadSettings() {
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    return { ...DEFAULT_SETTINGS, ...raw };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(s) {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(s, null, 2));
  } catch (e) {
    console.warn('Could not save settings:', e.message);
  }
}

ensureDir(DATA_DIR); // must exist before settings/history are read or written
let settings = loadSettings();

function ensureDir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    return true;
  } catch {
    return false;
  }
}
ensureDir(settings.downloadDir);

/* ------------------------------------------------------------------ *
 * Download manager + SSE fan-out
 * ------------------------------------------------------------------ */

const manager = new DownloadManager({ maxConcurrent: settings.maxConcurrent });
manager.setSettings(settings);

const clients = new Set();

function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    try { res.write(payload); } catch { clients.delete(res); }
  }
}

manager.on('job', (job) => broadcast('job', job));
manager.on('removed', (id) => broadcast('removed', { id }));
manager.on('completed', (job) => appendHistory(job));

/* ------------------------------------------------------------------ *
 * History
 * ------------------------------------------------------------------ */

const HISTORY_PATH = path.join(DATA_DIR, 'history.json');

function readHistory() {
  try { return JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8')); } catch { return []; }
}

function appendHistory(job) {
  const history = readHistory();
  history.unshift({
    id: job.id,
    title: job.title,
    url: job.url,
    platform: job.platform,
    thumbnail: job.thumbnail,
    filepath: job.filepath,
    quality: job.quality,
    size: job.total,
    duration: job.duration,
    finishedAt: job.finishedAt,
  });
  try {
    fs.writeFileSync(HISTORY_PATH, JSON.stringify(history.slice(0, 300), null, 2));
  } catch { /* non-fatal */ }
}

/* ------------------------------------------------------------------ *
 * App
 * ------------------------------------------------------------------ */

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(PUBLIC_DIR, { maxAge: 0, etag: false }));

const ok = (res, data) => res.json({ ok: true, ...data });
const bad = (res, message, code = 400) => res.status(code).json({ ok: false, error: message });

app.get('/api/health', async (req, res) => {
  const caps = await probe();
  const port = req.socket.localPort;
  ok(res, {
    ...caps,
    settings,
    platform: process.platform,
    lan: WANT_LAN
      ? {
        enabled: true,
        url: `http://${lanAddress()}:${port}`,
        alternatives: lanCandidates()
          .slice(1)
          .map((c) => ({ name: c.name, url: `http://${c.address}:${port}` })),
      }
      : { enabled: false },
  });
});

app.get('/api/settings', (_req, res) => ok(res, { settings }));

app.post('/api/settings', (req, res) => {
  const next = { ...settings };
  const body = req.body || {};

  if (typeof body.downloadDir === 'string' && body.downloadDir.trim()) {
    const dir = path.resolve(body.downloadDir.trim());
    if (!ensureDir(dir)) return bad(res, 'That folder could not be created.');
    next.downloadDir = dir;
  }
  if (typeof body.defaultQuality === 'string') next.defaultQuality = body.defaultQuality;
  if (typeof body.cookiesFromBrowser === 'string') next.cookiesFromBrowser = body.cookiesFromBrowser;
  if (typeof body.embedSubs === 'boolean') next.embedSubs = body.embedSubs;
  if (Number.isInteger(body.maxConcurrent)) {
    next.maxConcurrent = Math.min(6, Math.max(1, body.maxConcurrent));
    manager.maxConcurrent = next.maxConcurrent;
    manager.pump();
  }

  settings = next;
  manager.setSettings(settings);
  saveSettings(settings);
  ok(res, { settings });
});

/** Read one or many links and return normalized metadata for each. */
app.post('/api/resolve', async (req, res) => {
  const urls = extractUrls(req.body && req.body.text);
  if (!urls.length) return bad(res, 'No link found in that text.');

  const limited = urls.slice(0, 25);
  const results = await Promise.all(limited.map(async (url) => {
    try {
      const info = await fetchInfo(url, settings);
      return { ok: true, ...info };
    } catch (e) {
      return { ok: false, url, platform: detectPlatform(url), error: e.message };
    }
  }));

  ok(res, { results, truncated: urls.length > limited.length });
});

app.post('/api/download', (req, res) => {
  const body = req.body || {};
  const items = Array.isArray(body.items) ? body.items : [body];
  const created = [];

  for (const item of items) {
    if (!item || typeof item.url !== 'string' || !/^https?:\/\//i.test(item.url)) continue;
    created.push(manager.add({
      url: item.url,
      quality: item.quality || settings.defaultQuality,
      dir: settings.downloadDir,
      title: item.title,
      thumbnail: item.thumbnail,
      platform: item.platform || detectPlatform(item.url),
      duration: item.duration,
    }));
  }

  if (!created.length) return bad(res, 'Nothing valid to download.');
  ok(res, { jobs: created });
});

app.get('/api/jobs', (_req, res) => ok(res, { jobs: manager.list() }));

app.post('/api/jobs/:id/:action', (req, res) => {
  const { id, action } = req.params;
  const fn = { cancel: 'cancel', retry: 'retry', remove: 'remove' }[action];
  if (!fn) return bad(res, 'Unknown action.');
  const done = manager[fn](id);
  if (!done) return bad(res, 'That download is no longer available.', 404);
  ok(res, {});
});

app.post('/api/clear-finished', (_req, res) => {
  manager.clearFinished();
  ok(res, {});
});

app.get('/api/history', (_req, res) => ok(res, { history: readHistory() }));

app.delete('/api/history', (_req, res) => {
  try { fs.writeFileSync(HISTORY_PATH, '[]'); } catch { /* non-fatal */ }
  ok(res, {});
});

/** Reveal a finished file in the OS file manager. Confined to the download dir. */
app.post('/api/reveal', (req, res) => {
  const target = (req.body && req.body.path) || settings.downloadDir;
  const resolved = path.resolve(target);
  const root = path.resolve(settings.downloadDir);

  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    return bad(res, 'Refusing to open a location outside the download folder.', 403);
  }
  if (!fs.existsSync(resolved)) return bad(res, 'That file is no longer on disk.', 404);

  const isFile = fs.statSync(resolved).isFile();
  try {
    if (process.platform === 'win32') {
      spawn('explorer.exe', isFile ? ['/select,', resolved] : [resolved], {
        detached: true, stdio: 'ignore', windowsHide: false,
      }).unref();
    } else if (process.platform === 'darwin') {
      spawn('open', isFile ? ['-R', resolved] : [resolved], { detached: true, stdio: 'ignore' }).unref();
    } else {
      spawn('xdg-open', [isFile ? path.dirname(resolved) : resolved], {
        detached: true, stdio: 'ignore',
      }).unref();
    }
  } catch (e) {
    return bad(res, 'Could not open the file manager: ' + e.message);
  }
  ok(res, {});
});

/** Serve a finished file to the browser (so you can save it anywhere). */
app.get('/api/file', (req, res) => {
  const resolved = path.resolve(String(req.query.path || ''));
  const root = path.resolve(settings.downloadDir);
  if (!resolved.startsWith(root + path.sep)) return bad(res, 'Forbidden.', 403);
  if (!fs.existsSync(resolved)) return bad(res, 'Not found.', 404);
  res.download(resolved);
});

/** Live job updates. */
app.get('/api/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 2000\n\n');
  res.write(`event: snapshot\ndata: ${JSON.stringify({ jobs: manager.list() })}\n\n`);
  clients.add(res);

  const ping = setInterval(() => {
    try { res.write(': ping\n\n'); } catch { /* dropped below */ }
  }, 20000);

  req.on('close', () => {
    clearInterval(ping);
    clients.delete(res);
  });
});

// Unknown API routes should fail as JSON, not as the HTML shell.
app.use('/api', (_req, res) => bad(res, 'Unknown endpoint.', 404));
app.get('*', (_req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));

/* ------------------------------------------------------------------ *
 * Boot
 * ------------------------------------------------------------------ */

const BASE_PORT = Number(process.env.PORT) || 3000;

// Loopback by default. `--lan` (or HOST=0.0.0.0) also serves the local network
// so a phone can reach it — opt-in, because it exposes the app to the LAN.
const WANT_LAN = process.argv.includes('--lan') || process.env.HOST === '0.0.0.0';
const HOST = WANT_LAN ? '0.0.0.0' : '127.0.0.1';

// Machines are full of virtual adapters (VMware, Hyper-V, WSL, VPNs) whose
// addresses a phone can never reach. Rank them below real network cards.
const VIRTUAL_ADAPTER = /vmware|virtualbox|vethernet|hyper-?v|docker|wsl|tailscale|zerotier|loopback|bluetooth|tap-|tun\d/i;
const PHYSICAL_ADAPTER = /wi-?fi|wlan|wireless|ethernet|en\d|eth\d|lan/i;

/** Best guess at the address a phone on the same network should open. */
export function lanAddress() {
  const candidates = [];

  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    for (const net of addrs || []) {
      if (net.family !== 'IPv4' || net.internal) continue;

      let score = 0;
      if (VIRTUAL_ADAPTER.test(name)) score -= 10;
      if (PHYSICAL_ADAPTER.test(name)) score += 5;
      // 192.168.x and 10.x are ordinary home networks; 172.16-31 is where
      // container and VM bridges usually live.
      if (/^192\.168\./.test(net.address)) score += 3;
      else if (/^10\./.test(net.address)) score += 2;
      else if (/^172\.(1[6-9]|2\d|3[01])\./.test(net.address)) score -= 3;
      // A .1 address is typically the host end of a virtual bridge.
      if (/\.1$/.test(net.address)) score -= 2;

      candidates.push({ name, address: net.address, score });
    }
  }

  if (!candidates.length) return null;
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0].address;
}

/** Every reachable candidate, best first — shown if the top pick is wrong. */
export function lanCandidates() {
  const seen = new Set();
  const all = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    for (const net of addrs || []) {
      if (net.family !== 'IPv4' || net.internal || seen.has(net.address)) continue;
      seen.add(net.address);
      all.push({ name, address: net.address });
    }
  }
  const best = lanAddress();
  return all.sort((a, b) => (a.address === best ? -1 : b.address === best ? 1 : 0));
}

/**
 * Starts the HTTP server, stepping up a port if one is taken.
 * Resolves with { url, port } so an Electron shell can await it.
 */
export function start({ open = process.env.NO_OPEN !== '1', silent = false } = {}) {
  return new Promise((resolve, reject) => {
    const listen = (port, attempt = 0) => {
      const server = app.listen(port, HOST);

      server.on('listening', async () => {
        const url = `http://localhost:${port}`;
        const caps = await probe();

        if (!silent) {
          const lan = WANT_LAN ? lanAddress() : null;
          console.log('');
          console.log('  \x1b[35m●\x1b[0m  \x1b[1mFetchWave\x1b[0m  ready');
          console.log(`      ${url}`);
          if (lan) console.log(`      on your phone:  \x1b[36mhttp://${lan}:${port}\x1b[0m`);
          console.log('');
          console.log(`      yt-dlp  ${caps.ytdlp.ok ? '\x1b[32m' + caps.ytdlp.version + '\x1b[0m' : '\x1b[31mnot found\x1b[0m'}`);
          console.log(`      ffmpeg  ${caps.ffmpeg.ok ? '\x1b[32m' + caps.ffmpeg.version + '\x1b[0m' : '\x1b[31mnot found\x1b[0m'}`);
          console.log(`      saving to  ${settings.downloadDir}`);
          console.log('');
          console.log('      Press Ctrl+C to stop.');
          console.log('');
        }

        if (open) openBrowser(url);
        resolve({ url, port, server });
      });

      server.on('error', (err) => {
        if (err.code === 'EADDRINUSE' && attempt < 10) return listen(port + 1, attempt + 1);
        reject(err);
      });
    };

    listen(BASE_PORT);
  });
}

function openBrowser(url) {
  try {
    if (process.platform === 'win32') {
      spawn('cmd', ['/c', 'start', '""', url], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    } else if (process.platform === 'darwin') {
      spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
    } else {
      spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
    }
  } catch { /* user can open it manually */ }
}

// Only self-start when run directly; the Electron shell imports start() instead.
const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);
if (isDirectRun) {
  start().catch((err) => {
    console.error('Server failed to start:', err.message);
    process.exit(1);
  });
}

process.on('SIGINT', () => {
  for (const job of manager.list()) {
    if (job.status === 'downloading' || job.status === 'processing') manager.cancel(job.id);
  }
  process.exit(0);
});
