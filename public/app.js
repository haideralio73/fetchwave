/* ==================================================================
   FetchWave — client
   ================================================================== */

const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const state = {
  jobs: new Map(),
  history: [],
  settings: {},
  view: 'get',
  resolving: false,
};

/* ------------------------------------------------------------------ *
 * Platform glyphs
 * ------------------------------------------------------------------ */

const ICONS = {
  youtube: '<rect x="2" y="5" width="20" height="14" rx="4.5"/><path d="M10.2 9.3l4.6 2.7-4.6 2.7z" fill="currentColor" stroke="none"/>',
  tiktok: '<path d="M13.8 3v10.6a3.4 3.4 0 1 1-3.4-3.4"/><path d="M13.8 3.2c.5 2.3 2.2 3.9 4.4 4.1"/>',
  instagram: '<rect x="3" y="3" width="18" height="18" rx="5.4"/><circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r="1.1" fill="currentColor" stroke="none"/>',
  facebook: '<circle cx="12" cy="12" r="9.2"/><path d="M13.6 21.1v-7h2.3l.45-2.9H13.6V9.3c0-.85.3-1.4 1.45-1.4h1.4V5.3a18 18 0 0 0-2.1-.12c-2.2 0-3.65 1.3-3.65 3.75v2.28H8.4v2.9h2.3v7"/>',
  snapchat: '<path d="M12 3.4c2.6 0 4.4 1.9 4.4 4.4 0 1.1-.1 2 .2 2.5.4.6 1.5.3 1.9.9.3.6-.9 1.2-2 1.6-.4.2-.2.7.1 1.1.7 1 1.8 1.5 2.9 1.7-.3.8-1.9.8-2.7 1-.2.5-.2 1.2-.8 1.3-.8.1-1.8-.4-3-.1-1 .3-1.7 1.2-3 1.2s-2-.9-3-1.2c-1.2-.3-2.2.2-3 .1-.6-.1-.6-.8-.8-1.3-.8-.2-2.4-.2-2.7-1 1.1-.2 2.2-.7 2.9-1.7.3-.4.5-.9.1-1.1-1.1-.4-2.3-1-2-1.6.4-.6 1.5-.3 1.9-.9.3-.5.2-1.4.2-2.5 0-2.5 1.8-4.4 4.4-4.4z"/>',
  x: '<path d="M3.5 3.5l7.2 9.3L4 20.5h2.1l5.6-6.1 4.7 6.1h4.1l-7.6-9.8 6.3-6.8h-2.1l-5.2 5.6-4.3-5.6z" fill="currentColor" stroke="none"/>',
  reddit: '<circle cx="12" cy="12" r="9.2"/><circle cx="9" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1" fill="currentColor" stroke="none"/><path d="M9 15.2c1.7 1.2 4.3 1.2 6 0"/>',
  vimeo: '<path d="M3.5 8.3c1.4-1.3 2.8-2.7 3.8-2.8 1-.1 1.6.6 1.9 2.1.3 1.6.7 4 1.2 5 .4.9.9 1.3 1.5.6.6-.7 1.8-2.4 1.9-3.6.1-1.2-.9-1.2-1.8-.8.7-2.4 2.1-3.6 4.2-3.5 1.6.1 2.3 1.1 2.2 3.1-.1 2.7-2.9 6.8-4.2 8.3-1.3 1.5-2.6 2.6-3.9 2.3-1.3-.3-2-1.9-2.8-4.6-.8-2.8-1.2-5.7-2.3-5.6-.4 0-.9.4-1.4.9z" fill="currentColor" stroke="none"/>',
  twitch: '<path d="M4.5 3h15v10.5l-4 4h-3l-2.5 2.5H8v-2.5H4.5z"/><path d="M11 7.5v4M15 7.5v4"/>',
  pinterest: '<circle cx="12" cy="12" r="9.2"/><path d="M10.3 18.4c.6-1.1 1.5-4.4 1.5-4.4-.3-.6-.4-1.4-.4-2 0-1.9 1.1-3.3 2.4-3.3 1.1 0 1.7.85 1.7 1.9 0 1.15-.75 2.9-1.1 4.5-.3 1.35.7 2.45 2 2.45 2.4 0 4-3.1 4-6.7 0-2.8-1.9-4.9-5.3-4.9-3.85 0-6.25 2.9-6.25 6.1 0 1.1.35 1.9.85 2.5"/>',
  dailymotion: '<circle cx="12" cy="12" r="9.2"/><path d="M16 5.5v13M16 13.8a3.9 3.9 0 1 1-3.9-3.9"/>',
  soundcloud: '<path d="M4 15.5v-4M7 16.5v-6M10 16.5V8.5M13 16.5V7"/><path d="M13 16.5h4.8a2.7 2.7 0 0 0 0-5.4c-.3 0-.6 0-.85.13A4.6 4.6 0 0 0 13 7"/>',
  generic: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
};

const icon = (id, cls = '') =>
  `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICONS[id] || ICONS.generic}</svg>`;

const SHOWCASE = [
  ['youtube', 'YouTube'], ['tiktok', 'TikTok'], ['instagram', 'Instagram'],
  ['facebook', 'Facebook'], ['snapchat', 'Snapchat'], ['x', 'X'],
  ['reddit', 'Reddit'], ['twitch', 'Twitch'], ['vimeo', 'Vimeo'],
];

const HOST_MAP = [
  [/(^|\.)(youtube\.com|youtu\.be)$/i, 'youtube'],
  [/(^|\.)tiktok\.com$/i, 'tiktok'],
  [/(^|\.)(instagram\.com|instagr\.am)$/i, 'instagram'],
  [/(^|\.)(facebook\.com|fb\.watch|fb\.com)$/i, 'facebook'],
  [/(^|\.)snapchat\.com$/i, 'snapchat'],
  [/(^|\.)(twitter\.com|x\.com|t\.co)$/i, 'x'],
  [/(^|\.)(reddit\.com|redd\.it)$/i, 'reddit'],
  [/(^|\.)vimeo\.com$/i, 'vimeo'],
  [/(^|\.)twitch\.tv$/i, 'twitch'],
  [/(^|\.)(pinterest\.[a-z.]+|pin\.it)$/i, 'pinterest'],
  [/(^|\.)(dailymotion\.com|dai\.ly)$/i, 'dailymotion'],
  [/(^|\.)soundcloud\.com$/i, 'soundcloud'],
];

function platformOf(text) {
  const m = String(text || '').match(/https?:\/\/[^\s]+/i);
  if (!m) return null;
  try {
    const host = new URL(m[0]).hostname.replace(/^www\./i, '');
    for (const [re, id] of HOST_MAP) if (re.test(host)) return id;
    return 'generic';
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * Formatting
 * ------------------------------------------------------------------ */

function bytes(n) {
  if (!n || n < 0) return '—';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n < 10 && i > 0 ? n.toFixed(1) : Math.round(n)} ${u[i]}`;
}

function duration(sec) {
  if (sec == null || !Number.isFinite(sec)) return null;
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h
    ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
    : `${m}:${String(r).padStart(2, '0')}`;
}

function eta(sec) {
  if (sec == null || !Number.isFinite(sec)) return null;
  if (sec < 60) return `${Math.round(sec)}s left`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m ${Math.round(sec % 60)}s left`;
  return `${Math.floor(m / 60)}h ${m % 60}m left`;
}

function compact(n) {
  if (!n) return null;
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(n);
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ------------------------------------------------------------------ *
 * Toasts
 * ------------------------------------------------------------------ */

const TOAST_ICON = {
  ok:  '<path d="M20 6L9 17l-5-5"/>',
  err: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5M12 16.2v.2"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.8v.2"/>',
};

function toast(message, kind = 'info', ms = 4200) {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.innerHTML =
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${TOAST_ICON[kind] || TOAST_ICON.info}</svg>` +
    `<span class="msg">${esc(message)}</span>`;
  $('#toasts').append(el);
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 320);
  }, ms);
}

/* ------------------------------------------------------------------ *
 * API
 * ------------------------------------------------------------------ */

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  let data = {};
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok || data.ok === false) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

/* ------------------------------------------------------------------ *
 * Accent / platform reactivity
 * ------------------------------------------------------------------ */

function setPlatform(id) {
  const next = id || 'idle';
  if (document.documentElement.dataset.platform === next) return;
  document.documentElement.dataset.platform = next;

  // The prompt becomes the platform's glyph once a link is recognised,
  // and blinks like a terminal caret while the field is empty.
  const prompt = $('#dzIcon');
  const known = !!id && id !== 'generic';
  prompt.innerHTML = known ? icon(id) : '▸';
  prompt.classList.toggle('blink', !id);

  $$('.pchip').forEach((c) => c.classList.toggle('is-live', c.dataset.platform === id));
}

/* ------------------------------------------------------------------ *
 * Views
 * ------------------------------------------------------------------ */

function moveGlider() {
  const active = $('.tab.is-active');
  const glider = $('.tab-glider');
  if (!active || !glider) return;
  glider.style.width = `${active.offsetWidth}px`;
  glider.style.transform = `translateX(${active.offsetLeft - 4}px)`;
}

function applyView(name) {
  $$('.tab').forEach((t) => {
    const on = t.dataset.view === name;
    t.classList.toggle('is-active', on);
    t.setAttribute('aria-selected', String(on));
  });
  $$('.view').forEach((v) => v.classList.toggle('is-active', v.id === `view-${name}`));
  moveGlider();
}

function showView(name) {
  if (state.view === name) return;
  state.view = name;

  // Cross-fade the panels where the browser supports it; the glider keeps
  // its own spring either way.
  if (document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.startViewTransition(() => applyView(name));
  } else {
    applyView(name);
  }

  if (name === 'history') loadHistory();
}

/* ------------------------------------------------------------------ *
 * Resolve + result cards
 * ------------------------------------------------------------------ */

async function resolve(text) {
  const value = (text || '').trim();
  if (!value) return;
  if (state.resolving) return;

  state.resolving = true;
  const btn = $('#fetchBtn');
  btn.classList.add('is-busy');
  btn.disabled = true;
  showSkeletons(value);

  try {
    const { results, truncated } = await api('/api/resolve', { method: 'POST', body: { text: value } });
    renderResults(results);
    if (truncated) toast('Only the first 25 links were read.', 'info');
    const firstOk = results.find((r) => r.ok);
    if (firstOk) setPlatform(firstOk.platform?.id);
  } catch (e) {
    toast(e.message, 'err', 6500);
  } finally {
    state.resolving = false;
    btn.classList.remove('is-busy');
    btn.disabled = false;
  }
}

/**
 * Reading a link takes a few seconds (yt-dlp has to talk to the site), so
 * stand in a placeholder per detected URL rather than an empty page.
 */
function showSkeletons(text) {
  const count = Math.min((String(text).match(/https?:\/\/\S+/gi) || []).length || 1, 6);
  const root = $('#results');
  root.innerHTML = Array.from({ length: count }, (_, i) => `
    <div class="skeleton" style="animation-delay:${i * 70}ms">
      <div class="sk-thumb"></div>
      <div class="sk-lines">
        <div class="sk-line w70"></div>
        <div class="sk-line w40"></div>
        <div class="sk-line w55"></div>
      </div>
    </div>`).join('');
  document.body.classList.add('has-results');
}

function syncResultsState() {
  document.body.classList.toggle('has-results', $('#results').children.length > 0);
}

function renderResults(results) {
  const root = $('#results');
  root.innerHTML = '';

  results.forEach((r, i) => {
    const card = r.ok
      ? (r.kind === 'playlist' ? playlistCard(r) : videoCard(r))
      : errorCard(r);
    card.style.animationDelay = `${i * 60}ms`;
    root.append(card);
  });

  // Collapsing the hero keeps results on screen without a jarring scroll.
  document.body.classList.toggle('has-results', results.length > 0);
}

function videoCard(v) {
  const card = document.createElement('article');
  card.className = 'card';

  const qualities = (v.qualities || []).slice(0, 5);
  const chips = qualities.map((q, i) =>
    `<button class="qchip${i === 0 ? ' is-on' : ''}" data-q="${esc(q.id)}">
       ${esc(q.label)}${q.size ? `<small>${bytes(q.size)}</small>` : ''}
     </button>`).join('');

  const meta = [
    v.uploader ? esc(v.uploader) : null,
    v.viewCount ? `${compact(v.viewCount)} views` : null,
    v.isLive ? 'LIVE' : null,
  ].filter(Boolean).join(' <span class="sep">·</span> ');

  const dur = duration(v.duration);
  const isPortrait = ['tiktok', 'instagram', 'snapchat'].includes(v.platform?.id);

  card.innerHTML = `
    <div class="card-body">
      <div class="thumb${isPortrait ? ' portrait' : ''}">
        ${v.thumbnail
          ? `<img src="${esc(v.thumbnail)}" alt="" loading="lazy" referrerpolicy="no-referrer" />`
          : `<span class="thumb-fallback">${icon(v.platform?.id || 'generic')}</span>`}
        ${dur ? `<span class="dur">${dur}</span>` : ''}
      </div>
      <div class="card-main">
        <div>
          <h3 class="card-title">${esc(v.title)}</h3>
          <div class="meta-row">
            <span class="badge">${icon(v.platform?.id || 'generic')}${esc(v.platform?.label || 'Link')}</span>
            ${meta ? `<span>${meta}</span>` : ''}
          </div>
        </div>
        <div class="qualities">
          ${chips}
          <button class="qchip audio" data-q="audio">MP3<small>audio only</small></button>
        </div>
      </div>
      <div class="card-actions">
        <button class="btn solid js-download"><span class="btn-label">Download</span><span class="btn-spin"></span></button>
        <button class="btn ghost js-dismiss">Dismiss</button>
      </div>
    </div>`;

  let chosen = qualities[0]?.id || 'best';

  card.addEventListener('click', (e) => {
    const chip = e.target.closest('.qchip');
    if (chip) {
      chosen = chip.dataset.q;
      $$('.qchip', card).forEach((c) => c.classList.toggle('is-on', c === chip));
      return;
    }
    if (e.target.closest('.js-dismiss')) { card.remove(); syncResultsState(); return; }
    if (e.target.closest('.js-download')) {
      enqueue([{
        url: v.url, quality: chosen, title: v.title,
        thumbnail: v.thumbnail, platform: v.platform, duration: v.duration,
      }]);
      card.remove(); syncResultsState();
    }
  });

  return card;
}

function playlistCard(p) {
  const card = document.createElement('article');
  card.className = 'card';
  card.innerHTML = `
    <div class="card-body">
      <div class="thumb">
        ${p.entries[0]?.thumbnail ? `<img src="${esc(p.entries[0].thumbnail)}" alt="" loading="lazy" referrerpolicy="no-referrer" />` : ''}
        <span class="dur">${p.count} items</span>
      </div>
      <div class="card-main">
        <div>
          <h3 class="card-title">${esc(p.title)}</h3>
          <div class="meta-row">
            <span class="badge">${icon(p.platform?.id || 'generic')}${esc(p.platform?.label || 'Playlist')}</span>
            ${p.uploader ? `<span>${esc(p.uploader)}</span>` : ''}
            <span class="sep">·</span><span>${p.count} videos</span>
          </div>
        </div>
        <div class="qualities">
          <button class="qchip is-on" data-q="best">Best<small>per video</small></button>
          <button class="qchip" data-q="h1080">1080p</button>
          <button class="qchip" data-q="h720">720p</button>
          <button class="qchip audio" data-q="audio">MP3<small>audio only</small></button>
        </div>
      </div>
      <div class="card-actions">
        <button class="btn solid js-download"><span class="btn-label">Queue all ${p.count}</span><span class="btn-spin"></span></button>
        <button class="btn ghost js-dismiss">Dismiss</button>
      </div>
    </div>`;

  let chosen = 'best';
  card.addEventListener('click', (e) => {
    const chip = e.target.closest('.qchip');
    if (chip) {
      chosen = chip.dataset.q;
      $$('.qchip', card).forEach((c) => c.classList.toggle('is-on', c === chip));
      return;
    }
    if (e.target.closest('.js-dismiss')) { card.remove(); syncResultsState(); return; }
    if (e.target.closest('.js-download')) {
      enqueue(p.entries.map((en) => ({
        url: en.url, quality: chosen, title: en.title,
        thumbnail: en.thumbnail, platform: p.platform, duration: en.duration,
      })));
      card.remove(); syncResultsState();
    }
  });

  return card;
}

function errorCard(r) {
  const card = document.createElement('article');
  card.className = 'card is-error';
  card.innerHTML = `
    <div class="card-error">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <circle cx="12" cy="12" r="9"/><path d="M12 7.5v5M12 16.2v.2"/>
      </svg>
      <div>
        <div>${esc(r.error)}</div>
        <div class="url">${esc(r.url)}</div>
      </div>
    </div>`;
  return card;
}

async function enqueue(items) {
  try {
    const { jobs } = await api('/api/download', { method: 'POST', body: { items } });
    jobs.forEach((j) => state.jobs.set(j.id, j));
    renderQueue();
    showView('queue');
    toast(items.length > 1 ? `${items.length} videos queued.` : 'Download started.', 'ok', 2600);
  } catch (e) {
    toast(e.message, 'err');
  }
}

/* ------------------------------------------------------------------ *
 * Queue
 * ------------------------------------------------------------------ */

const STATE_LABEL = {
  queued: 'Waiting', downloading: 'Downloading', processing: 'Merging',
  done: 'Saved', error: 'Failed', canceled: 'Canceled',
};

function jobRow(job) {
  const el = document.createElement('div');
  el.className = `job status-${job.status}`;
  el.dataset.id = job.id;
  el.innerHTML = jobInner(job);
  return el;
}

/** The volatile half of a row — rebuilt on every progress tick. */
function jobSub(job) {
  const bits = [`<span class="state">${STATE_LABEL[job.status] || job.status}</span>`];
  if (job.status === 'downloading') {
    if (job.total) bits.push(`<span class="pct">${(job.percent || 0).toFixed(0)}%</span>`);
    if (job.total) bits.push(`${bytes(job.downloaded)} / ${bytes(job.total)}`);
    if (job.speed) bits.push(`${bytes(job.speed)}/s`);
    const e = eta(job.eta);
    if (e) bits.push(e);
  } else if (job.status === 'done') {
    if (job.total) bits.push(bytes(job.total));
    bits.push(job.quality === 'audio' ? 'MP3' : 'MP4');
  } else if (job.status === 'queued') {
    bits.push(job.platform?.label || '');
  }
  return bits.filter(Boolean).join(' <span class="sep">·</span> ');
}

function jobInner(job) {
  const pct = Math.max(0, Math.min(100, job.percent || 0));
  const showBar = ['queued', 'downloading', 'processing'].includes(job.status);
  const indeterminate = job.status === 'processing' || (job.status === 'downloading' && !job.total);

  const actions = [];
  if (job.status === 'done') {
    actions.push(btn('reveal', 'good', '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>', 'Show in folder'));
    actions.push(btn('remove', '', '<path d="M6 6l12 12M18 6L6 18"/>', 'Remove from list'));
  } else if (job.status === 'error' || job.status === 'canceled') {
    // Most failures we can actually fix are the login/PO-token kind, and the
    // fix lives in Settings — so offer it right here instead of in prose.
    if (/cookies|Settings/i.test(job.error || '')) {
      actions.push(btn('fix', 'good', '<circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.11a1.7 1.7 0 0 0-2.9-1.2l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0-1.2-2.9H3a2 2 0 1 1 0-4h.11a1.7 1.7 0 0 0 1.2-2.9l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 2.9-1.2V3a2 2 0 1 1 4 0v.11a1.7 1.7 0 0 0 2.9 1.2l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0 1.2 2.9H21a2 2 0 1 1 0 4h-.11a1.7 1.7 0 0 0-1.49 1z"/>', 'Fix in Settings'));
    }
    actions.push(btn('retry', 'good', '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 5v6h-6"/>', 'Try again'));
    actions.push(btn('remove', '', '<path d="M6 6l12 12M18 6L6 18"/>', 'Remove from list'));
  } else {
    actions.push(btn('cancel', 'bad', '<path d="M6 6l12 12M18 6L6 18"/>', 'Cancel'));
  }

  return `
    <div class="job-thumb">${job.thumbnail ? `<img src="${esc(job.thumbnail)}" alt="" loading="lazy" referrerpolicy="no-referrer" />` : ''}</div>
    <div class="job-main">
      <div class="job-title" title="${esc(job.title)}">${esc(job.title)}</div>
      <div class="job-sub">${jobSub(job)}</div>
      ${showBar ? `<div class="bar"><div class="bar-fill${indeterminate ? ' indeterminate' : ''}" style="width:${pct}%"></div></div>` : ''}
      ${job.error ? `<div class="job-error">${esc(job.error)}</div>` : ''}
    </div>
    <div class="job-actions">${actions.join('')}</div>`;
}

function btn(action, kind, path, title) {
  return `<button class="mini-btn ${kind}" data-action="${action}" title="${title}" aria-label="${title}">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>
  </button>`;
}

function renderQueue() {
  const list = $('#queueList');
  const jobs = [...state.jobs.values()].sort((a, b) => b.createdAt - a.createdAt);

  // Reconcile in place. Rebuilding innerHTML on every progress tick would
  // restart the bar's width transition several times a second, so a tick that
  // only moves the needle patches the two nodes that actually changed.
  const seen = new Set();
  for (const job of jobs) {
    seen.add(job.id);
    let row = list.querySelector(`[data-id="${job.id}"]`);

    if (!row) {
      row = jobRow(job);
      list.prepend(row);
      row.dataset.status = job.status;
      continue;
    }

    if (row.dataset.status !== job.status) {
      const finishing = job.status === 'done' && row.dataset.status !== 'done';
      row.className = `job status-${job.status}`;
      row.innerHTML = jobInner(job);
      row.dataset.status = job.status;
      if (finishing) {
        row.classList.add('just-done');
        setTimeout(() => row.classList.remove('just-done'), 1200);
      }
      continue;
    }

    const sub = row.querySelector('.job-sub');
    if (sub) sub.innerHTML = jobSub(job);
    const fill = row.querySelector('.bar-fill');
    if (fill && job.total) {
      fill.classList.remove('indeterminate');
      fill.style.width = `${Math.max(0, Math.min(100, job.percent || 0))}%`;
    }
  }
  $$('.job', list).forEach((row) => { if (!seen.has(row.dataset.id)) row.remove(); });

  const active = jobs.filter((j) => ['queued', 'downloading', 'processing'].includes(j.status)).length;
  const badge = $('#queueCount');
  const hadBadge = !badge.hidden;
  badge.textContent = String(active);
  badge.hidden = active === 0;
  // Showing/hiding the badge resizes the tab, so the glider must re-measure.
  if (hadBadge !== !badge.hidden) moveGlider();

  setActivity(active ? active + ' downloading' : (jobs.length ? 'all finished' : 'idle'));
  $('#queueEmpty').classList.toggle('show', jobs.length === 0);
  $('#queueSummary').textContent = active
    ? `${active} in progress`
    : jobs.length ? 'All finished.' : 'Nothing downloading right now.';

  // Reflect overall progress in the tab title.
  const running = jobs.find((j) => j.status === 'downloading');
  document.title = running
    ? `${Math.round(running.percent)}% · FetchWave`
    : 'FetchWave — paste a link, keep the video';
}

$('#queueList').addEventListener('click', async (e) => {
  const button = e.target.closest('.mini-btn');
  if (!button) return;
  const id = button.closest('.job')?.dataset.id;
  const action = button.dataset.action;
  if (!id) return;

  try {
    if (action === 'fix') {
      openDrawer();
      $('#setCookies').focus();
      toast('Pick your browser below, close that browser, then hit Try again.', 'info', 7000);
      return;
    }
    if (action === 'reveal') {
      const job = state.jobs.get(id);
      await api('/api/reveal', { method: 'POST', body: { path: job?.filepath } });
    } else {
      await api(`/api/jobs/${id}/${action}`, { method: 'POST' });
      if (action === 'remove') { state.jobs.delete(id); renderQueue(); }
    }
  } catch (err) {
    toast(err.message, 'err');
  }
});

$('#clearFinished').addEventListener('click', async () => {
  try {
    await api('/api/clear-finished', { method: 'POST' });
    for (const [id, j] of state.jobs) {
      if (['done', 'error', 'canceled'].includes(j.status)) state.jobs.delete(id);
    }
    renderQueue();
  } catch (e) { toast(e.message, 'err'); }
});

/* ------------------------------------------------------------------ *
 * Library
 * ------------------------------------------------------------------ */

async function loadHistory() {
  try {
    const { history } = await api('/api/history');
    state.history = history;
    renderHistory();
  } catch (e) { toast(e.message, 'err'); }
}

function renderHistory() {
  const grid = $('#historyGrid');
  grid.innerHTML = '';
  const items = state.history;

  $('#historyEmpty').classList.toggle('show', items.length === 0);
  $('#historySummary').textContent = items.length
    ? `${items.length} file${items.length === 1 ? '' : 's'} saved`
    : "Everything you've saved.";

  items.forEach((h, i) => {
    const tile = document.createElement('article');
    tile.className = 'tile';
    tile.style.animationDelay = `${Math.min(i, 12) * 40}ms`;
    tile.innerHTML = `
      <div class="tile-thumb">
        ${h.thumbnail
          ? `<img src="${esc(h.thumbnail)}" alt="" loading="lazy" referrerpolicy="no-referrer" />`
          : `<span class="thumb-fallback">${icon(h.platform?.id || 'generic')}</span>`}
        <div class="tile-play"><span>
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z"/></svg>
        </span></div>
      </div>
      <div class="tile-info">
        <div class="tile-title">${esc(h.title)}</div>
        <div class="tile-meta">
          ${icon(h.platform?.id || 'generic')}
          <span>${esc(h.platform?.label || '')}</span>
          ${h.size ? `<span class="sep">·</span><span>${bytes(h.size)}</span>` : ''}
        </div>
      </div>`;
    tile.addEventListener('click', async () => {
      if (!h.filepath) return toast('That file was not recorded on disk.', 'err');
      try {
        await api('/api/reveal', { method: 'POST', body: { path: h.filepath } });
      } catch (e) { toast(e.message, 'err'); }
    });
    grid.append(tile);
  });
}

$('#openFolder').addEventListener('click', async () => {
  try { await api('/api/reveal', { method: 'POST', body: {} }); }
  catch (e) { toast(e.message, 'err'); }
});

$('#clearHistory').addEventListener('click', async () => {
  try {
    await api('/api/history', { method: 'DELETE' });
    state.history = [];
    renderHistory();
    toast('Library list cleared. Your files are untouched.', 'ok');
  } catch (e) { toast(e.message, 'err'); }
});

/* ------------------------------------------------------------------ *
 * Settings
 * ------------------------------------------------------------------ */

function openDrawer() {
  $('#scrim').hidden = false;
  $('#drawer').hidden = false;
  $('#setDir').focus();
}

function closeDrawer() {
  $('#scrim').hidden = true;
  $('#drawer').hidden = true;
}

$('#openSettings').addEventListener('click', openDrawer);
$('#closeSettings').addEventListener('click', closeDrawer);
$('#scrim').addEventListener('click', closeDrawer);

async function saveSettings(patch) {
  try {
    const { settings } = await api('/api/settings', { method: 'POST', body: patch });
    state.settings = settings;
    fillSettings(settings);
  } catch (e) {
    toast(e.message, 'err');
  }
}

function fillSettings(s) {
  $('#setDir').value = s.downloadDir || '';
  $('#setQuality').value = s.defaultQuality || 'best';
  $('#setCookies').value = s.cookiesFromBrowser || 'none';
  $('#setSubs').checked = !!s.embedSubs;
  $('#concValue').value = s.maxConcurrent ?? 3;
}

$('#setDir').addEventListener('change', (e) => saveSettings({ downloadDir: e.target.value }));
$('#setQuality').addEventListener('change', (e) => saveSettings({ defaultQuality: e.target.value }));
$('#setCookies').addEventListener('change', (e) => saveSettings({ cookiesFromBrowser: e.target.value }));
$('#setSubs').addEventListener('change', (e) => saveSettings({ embedSubs: e.target.checked }));

$('#concMinus').addEventListener('click', () =>
  saveSettings({ maxConcurrent: Math.max(1, (state.settings.maxConcurrent || 3) - 1) }));
$('#concPlus').addEventListener('click', () =>
  saveSettings({ maxConcurrent: Math.min(6, (state.settings.maxConcurrent || 3) + 1) }));

/* ------------------------------------------------------------------ *
 * Live updates
 * ------------------------------------------------------------------ */

function connect() {
  const source = new EventSource('/api/events');

  source.addEventListener('snapshot', (e) => {
    const { jobs } = JSON.parse(e.data);
    state.jobs = new Map(jobs.map((j) => [j.id, j]));
    renderQueue();
  });

  source.addEventListener('job', (e) => {
    const job = JSON.parse(e.data);
    const previous = state.jobs.get(job.id);
    state.jobs.set(job.id, job);
    renderQueue();

    if (previous && previous.status !== 'done' && job.status === 'done') {
      toast(`Saved “${job.title.slice(0, 60)}”`, 'ok');
      if (state.view === 'history') loadHistory();
    }
    if (previous && previous.status !== 'error' && job.status === 'error') {
      toast(job.error || 'Download failed.', 'err', 7000);
    }
  });

  source.addEventListener('removed', (e) => {
    state.jobs.delete(JSON.parse(e.data).id);
    renderQueue();
  });

  source.onerror = () => { /* EventSource retries on its own */ };
}

/* ------------------------------------------------------------------ *
 * Input wiring
 * ------------------------------------------------------------------ */

const input = $('#urlInput');

$('#pasteForm').addEventListener('submit', (e) => {
  e.preventDefault();
  resolve(input.value);
});

input.addEventListener('input', () => setPlatform(platformOf(input.value)));

$('#pasteBtn').addEventListener('click', async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (!text?.trim()) return toast('Clipboard is empty.', 'info');
    input.value = text.trim();
    setPlatform(platformOf(text));
    resolve(text);
  } catch {
    input.focus();
    toast('Your browser blocked clipboard access — press Ctrl+V instead.', 'info');
  }
});

// Paste anywhere on the page.
document.addEventListener('paste', (e) => {
  if (e.target.matches('input, textarea')) return;
  const text = e.clipboardData?.getData('text');
  if (!text) return;
  showView('get');
  input.value = text.trim();
  setPlatform(platformOf(text));
  resolve(text);
});

// Drag a link onto the window.
const dz = $('#pasteForm');
['dragenter', 'dragover'].forEach((ev) =>
  document.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('is-drag'); }));
['dragleave', 'drop'].forEach((ev) =>
  document.addEventListener(ev, (e) => {
    e.preventDefault();
    if (ev === 'dragleave' && e.relatedTarget) return;
    dz.classList.remove('is-drag');
  }));
document.addEventListener('drop', (e) => {
  const text = e.dataTransfer?.getData('text');
  if (!text) return;
  showView('get');
  input.value = text.trim();
  setPlatform(platformOf(text));
  resolve(text);
});

$$('.tab').forEach((t) => t.addEventListener('click', () => showView(t.dataset.view)));

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeDrawer();
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); showView('get'); input.focus(); input.select(); }
});

window.addEventListener('resize', moveGlider);

/* ------------------------------------------------------------------ *
 * Boot
 * ------------------------------------------------------------------ */

function renderPlatformStrip() {
  $('#platformStrip').innerHTML = SHOWCASE.map(([id, label]) =>
    `<span class="pchip" data-platform="${id}">${icon(id)}${label}</span>`).join('');
}

async function boot() {
  renderPlatformStrip();
  moveGlider();
  connect();

  try {
    const health = await api('/api/health');
    state.settings = health.settings;
    fillSettings(health.settings);

    const bar = $('#statusbar');
    const good = health.ytdlp.ok;
    bar.classList.toggle('ok', good);
    bar.classList.toggle('fail', !good);
    $('#stEngine').textContent = good ? 'ready' : 'engine missing';
    $('#stYtdlp').textContent = `yt-dlp ${health.ytdlp.ok ? health.ytdlp.version : '—'}`;
    $('#stFfmpeg').textContent = `ffmpeg ${health.ffmpeg.ok ? String(health.ffmpeg.version).split('-')[0] : '—'}`;

    renderPhoneCard(health.lan);

    $('#engineCard').innerHTML = `
      <div class="row"><span class="k">yt-dlp</span><span class="v ${health.ytdlp.ok ? 'ok' : 'no'}">${health.ytdlp.ok ? esc(health.ytdlp.version) : 'not found'}</span></div>
      <div class="row"><span class="k">ffmpeg</span><span class="v ${health.ffmpeg.ok ? 'ok' : 'no'}">${health.ffmpeg.ok ? esc(health.ffmpeg.version) : 'not found'}</span></div>`;

    if (!health.ytdlp.ok) {
      toast('yt-dlp was not found. Install it with:  pip install -U yt-dlp', 'err', 12000);
    } else if (!health.ffmpeg.ok) {
      toast('ffmpeg was not found — high-quality merging and MP3 need it.', 'err', 9000);
    }
  } catch (e) {
    toast('Could not reach the local server.', 'err');
  }

  input.focus();
}

boot();

/* ------------------------------------------------------------------ *
 * Pointer-reactive motion
 * ------------------------------------------------------------------ */

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

/**
 * The blueprint grid shifts a few pixels against the cursor. Small enough
 * that you feel depth rather than notice an effect; throttled to one rAF.
 */
function initPointerMotion() {
  if (reduceMotion.matches) return;

  const grid = $('.grid-lines');
  if (!grid) return;

  let queued = false;
  let lastX = 0;
  let lastY = 0;

  const apply = () => {
    queued = false;
    const nx = (lastX / window.innerWidth) * 2 - 1;   // -1..1
    const ny = (lastY / window.innerHeight) * 2 - 1;
    grid.style.transform = `translate3d(${(-nx * 9).toFixed(1)}px, ${(-ny * 9).toFixed(1)}px, 0)`;
  };

  window.addEventListener('pointermove', (e) => {
    lastX = e.clientX;
    lastY = e.clientY;
    if (!queued) {
      queued = true;
      requestAnimationFrame(apply);
    }
  }, { passive: true });
}

/**
 * Decodes the headline on first paint: each line settles left-to-right out
 * of random glyphs. Runs once, costs nothing after it finishes.
 */
function scrambleHeadline() {
  if (reduceMotion.matches) return;
  const GLYPHS = '▚▞▘▝▗▖ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/\\|<>*#$%';
  const pick = () => GLYPHS[(Math.random() * GLYPHS.length) | 0];

  $$('.hero-title .line').forEach((el, lineIndex) => {
    const target = el.dataset.text || el.textContent;
    const start = performance.now() + lineIndex * 110;
    const perChar = 26;   // ms before a character locks in
    const total = target.length * perChar + 220;

    const tick = (now) => {
      const t = now - start;
      if (t < 0) { requestAnimationFrame(tick); return; }

      let out = '';
      for (let i = 0; i < target.length; i++) {
        const settleAt = i * perChar;
        if (t >= settleAt + 120) out += target[i];
        else if (t >= settleAt - 60) out += target[i] === ' ' ? ' ' : pick();
        else out += ' ';
      }
      el.textContent = out;

      if (t < total) requestAnimationFrame(tick);
      else el.textContent = target;
    };
    requestAnimationFrame(tick);
  });
}

/** Right-hand side of the status bar: what the machine is doing now. */
function setActivity(text) {
  const el = $('#stActivity');
  if (el) el.textContent = text;
}

/** Library tiles lean towards the cursor. */
function initTileTilt() {
  if (reduceMotion.matches) return;
  const MAX = 7; // degrees

  $('#historyGrid').addEventListener('pointermove', (e) => {
    const tile = e.target.closest('.tile');
    if (!tile) return;
    const r = tile.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    tile.style.transform =
      `perspective(700px) rotateX(${(-py * MAX).toFixed(2)}deg) rotateY(${(px * MAX).toFixed(2)}deg) translateY(-4px)`;
  }, { passive: true });

  $('#historyGrid').addEventListener('pointerleave', (e) => {
    const tile = e.target.closest?.('.tile');
    if (tile) tile.style.transform = '';
  }, { passive: true });

  // Leaving one tile for another needs clearing too.
  $('#historyGrid').addEventListener('pointerout', (e) => {
    const tile = e.target.closest?.('.tile');
    if (tile && !tile.contains(e.relatedTarget)) tile.style.transform = '';
  }, { passive: true });
}

initPointerMotion();
initTileTilt();

if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(scrambleHeadline);
} else {
  scrambleHeadline();
}

/* ------------------------------------------------------------------ *
 * Installable app (PWA)
 * ------------------------------------------------------------------ */

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* Non-fatal: the app works fine without offline caching. */
    });
  });
}

/**
 * Android share-sheet entry point. The manifest declares a share_target, so
 * "Share → FetchWave" from TikTok/YouTube/etc. lands here as ?url= or ?text=.
 */
(function handleShareTarget() {
  const params = new URLSearchParams(location.search);
  const shared = params.get('url') || params.get('text') || '';
  if (!shared.trim()) return;

  // Drop the query so a refresh doesn't re-trigger the same download.
  history.replaceState(null, '', location.pathname);

  input.value = shared.trim();
  setPlatform(platformOf(shared));
  resolve(shared);
})();

/* ------------------------------------------------------------------ *
 * "Use it from your phone" panel
 * ------------------------------------------------------------------ */

function renderPhoneCard(lan) {
  const body = $('#phoneBody');
  if (!body) return;

  if (lan && lan.enabled && lan.url && !lan.url.includes('null')) {
    body.innerHTML = `
      <div class="phone-url">
        <code id="phoneUrl">${esc(lan.url)}</code>
        <button class="btn ghost" id="copyPhone" type="button">Copy</button>
      </div>
      <span class="field-hint">
        Open that on your phone (same Wi-Fi). In Chrome, use ⋮ &rarr; <b>Add to Home screen</b> to
        install it as an app — it then shows up in Android's share sheet, so you can share a link
        straight from TikTok or YouTube into FetchWave.
      </span>
      ${lan.alternatives?.length ? `
        <details class="alt-addrs">
          <summary>That address not working?</summary>
          <span class="field-hint">This machine has more than one network. Try:</span>
          <ul>${lan.alternatives.map((a) =>
            `<li><code>${esc(a.url)}</code> <em>${esc(a.name)}</em></li>`).join('')}</ul>
        </details>` : ''}`;

    $('#copyPhone').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(lan.url);
        toast('Address copied.', 'ok', 2200);
      } catch {
        toast(lan.url, 'info', 8000);
      }
    });
    return;
  }

  body.innerHTML = `
    <span class="field-hint">
      Phone access is off. Start FetchWave with <code>start-lan.bat</code>
      (or <code>npm run start:lan</code>) and this panel will show the address to open
      on your phone. It stays on your own network — nothing is exposed to the internet.
    </span>`;
}
