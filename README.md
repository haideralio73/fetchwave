# FetchWave

**Paste a link. Keep the video.**

A video downloader that runs entirely on your own computer. Paste a link from
YouTube, TikTok, Instagram, Facebook, Snapchat — or any of the ~1000 sites
[yt-dlp](https://github.com/yt-dlp/yt-dlp) supports — pick a quality, and the
file lands in your downloads folder.

No ads. No uploads. No account. Nothing leaves your machine except the request
to the site you're downloading from.

```
┌───────────────────────────────────────────────────────────┐
│  ▸ paste a video link, or several at once  [Paste][Fetch] │
└───────────────────────────────────────────────────────────┘
   YOUTUBE  TIKTOK  INSTAGRAM  FACEBOOK  SNAPCHAT  X  REDDIT
```

---

## Contents

- [Install](#install)
- [Getting started](#getting-started)
- [What works](#what-works)
- [Making YouTube and TikTok work](#making-youtube-and-tiktok-work)
- [Using it from your phone](#using-it-from-your-phone)
- [Settings](#settings)
- [Troubleshooting](#troubleshooting)

---

## Install

You need three things. Two are one-line installs.

### 1. Node.js

Download the LTS build from [nodejs.org](https://nodejs.org) and run the
installer. Accept the defaults.

### 2. yt-dlp and ffmpeg

**Windows** — open PowerShell and run:

```powershell
winget install Gyan.FFmpeg
pip install -U yt-dlp yt-dlp-ejs
```

**macOS** — with [Homebrew](https://brew.sh):

```bash
brew install ffmpeg
pip3 install -U yt-dlp yt-dlp-ejs
```

**Linux**:

```bash
sudo apt install ffmpeg          # or your distro's package manager
pip install -U yt-dlp yt-dlp-ejs
```

> `yt-dlp-ejs` is what lets yt-dlp solve YouTube's player challenge. Skip it and
> YouTube won't work at all.

### 3. FetchWave

```bash
git clone https://github.com/haideralio73/fetchwave.git
cd fetchwave
```

Then **double-click `start.bat`** (Windows) or run `./start.sh` (macOS/Linux).

The first run installs dependencies, then your browser opens at
<http://localhost:5177>. That's it.

To stop it, close the window it opened, or press `Ctrl+C` in it.

---

## Getting started

### Download one video

1. Copy a video link from your browser or the app's share button.
2. Click into FetchWave and press **Ctrl+V** — anywhere on the page, you don't
   need to click the box first.
3. Press **Fetch**. The video's title, thumbnail and available qualities appear.
4. Pick a quality and press **Download**.

The view switches to **Queue**, where you'll see live progress, speed and time
remaining. When it's done, press the folder button to reveal the file.

### Things worth knowing

**Several links at once.** Paste a whole block of text — a chat log, a list of
links, anything. Every URL in it becomes its own card. Up to 25 at a time.

**Audio only.** Every card has a dashed **MP3** option at the end of the quality
row. Picks the best audio and converts it.

**Playlists and channels.** Paste one and FetchWave detects it, then offers
**Queue all N** instead of a single download.

**Drag and drop.** Drag a link straight from your browser's address bar onto the
window.

**Keyboard.** `Ctrl+K` jumps back to the paste box. `Esc` closes Settings.

**The colours move.** The whole interface re-tunes to whatever platform you
paste — red for YouTube, cyan for TikTok, orange for Reddit, yellow for
Snapchat. It's how you know the link was recognised before you even press Fetch.

---

## What works

Tested by actually downloading video data from each platform, not just reading
the title — which is the distinction that matters, because a site can hand over
a title and still refuse the video.

| Platform | Status | Notes |
|---|---|---|
| Instagram | works | public posts; stories and private accounts need cookies |
| Facebook | works | public videos; private ones need cookies |
| Snapchat | works | Spotlight only — private stories can't be linked to |
| Reddit | works | |
| X / Twitter | works | |
| Vimeo | works | |
| Dailymotion | works | |
| Pinterest | works | |
| SoundCloud | works | audio |
| **YouTube** | needs setup | see below |
| **TikTok** | needs setup | see below |

Anything else yt-dlp supports should also work — paste it and find out.

You can re-run this check yourself at any time:

```bash
npm run test:platforms
```

> If a platform fails once, try again before believing it. Running the test
> repeatedly gets you rate-limited by these sites, and a rate-limited attempt
> looks exactly like a broken one.

---

## Making YouTube and TikTok work

Both are blocked for the same underlying reason — they can tell you're not a
normal browser — and both are fixed by the same switch.

### The fix

**Settings → Use cookies from browser → pick your browser.**

Then **close that browser completely** and try the download again.

That's usually all it takes. It also unlocks private Instagram posts,
login-gated Facebook videos, members-only uploads and age-restricted content.

> **Why close the browser?** Chrome and Edge lock their cookie database while
> they're running, so yt-dlp can't read it. Firefox is usually fine either way.

> **Is this safe?** The cookies are read on your computer by yt-dlp and sent
> only to the site you're downloading from — the same place your browser would
> send them. FetchWave has no server of its own and never transmits them
> anywhere else.

When a download fails for this reason, the failed row in the Queue grows a **⚙**
button that takes you straight to the right setting.

### What's actually happening

- **YouTube** now wants a "proof-of-origin" token on the video file itself. The
  title, thumbnail and quality list all load fine, then the download returns
  `HTTP 403`. A logged-in session satisfies it for most videos.
- **TikTok** answers unrecognised clients with a bot-check page instead of the
  video, so even the title fails to load. Real browser cookies get past it.

### If cookies aren't enough for YouTube

Some videos need a dedicated token provider. Install the plugin and run its
helper:

```bash
pip install -U bgutil-ytdlp-pot-provider
docker run -d -p 4416:4416 brainicism/bgutil-ytdlp-pot-provider
```

yt-dlp finds it automatically once it's listening on port 4416. Without Docker,
the same project ships a Node version — see
[bgutil-ytdlp-pot-provider](https://github.com/Brainicism/bgutil-ytdlp-pot-provider).

### When things break later

These defences change every few weeks. Update first, debug second:

```bash
pip install -U yt-dlp yt-dlp-ejs
```

---

## Using it from your phone

Your phone becomes the remote control; your PC does the downloading and keeps
the files. No app store, no build tools.

1. Start it with **`start-lan.bat`** instead (or `npm run start:lan`).
2. Windows will ask about the firewall — allow it, and tick **Private networks**.
3. Open **Settings** in FetchWave. It shows the address to use, something like
   `http://192.168.1.42:5177`.
4. On your phone — same Wi-Fi — open that address in Chrome.
5. Tap **⋮ → Add to Home screen**.

You now have a FetchWave icon that opens full-screen like a normal app.

**The good part:** it registers as a share target. Open TikTok or YouTube on
your phone, hit **Share**, and **FetchWave** is in the list. Tap it and the
download starts on your PC.

If the address doesn't work, open the **"That address not working?"** dropdown in
Settings — machines often have several network adapters and it lists the others.

This stays on your own network. Nothing is exposed to the internet.

---

## Settings

| Setting | What it does |
|---|---|
| **Save downloads to** | Any folder path on this computer. |
| **Default quality** | Pre-selects this on every card. `Best available` picks the highest. |
| **Use cookies from browser** | The fix for YouTube, TikTok, and anything private or login-gated. |
| **Simultaneous downloads** | 1–6 at once. Lower it on a slow connection. |
| **Embed English subtitles** | Adds subtitle tracks into the MP4 when the site offers them. |

Settings are saved to `config.json` next to the app. Your download history is in
`history.json` — clearing the Library empties that list but never deletes files.

---

## Troubleshooting

**"yt-dlp is not installed or not on PATH"**
It isn't installed, or the terminal can't see it. Run `pip install -U yt-dlp`,
then close and reopen your terminal. Check with `yt-dlp --version`.

**Downloads fail near the end, or there's no audio**
That's ffmpeg missing — it's what merges the separate video and audio streams.
The status bar at the top shows whether it was found.

**"That link is not supported"**
The URL isn't a media page — often a profile or a search result rather than a
specific video. Open the video itself and copy that link.

**Everything is suddenly failing**
Sites change their defences constantly. Update yt-dlp first:
`pip install -U yt-dlp yt-dlp-ejs`.

**Port 5177 is busy**
FetchWave steps up to 5178, 5179 and so on automatically. The window tells you
which one it used.

**A download is stuck**
Press **×** to cancel, then the retry button. Partly-downloaded files resume
rather than restarting.

**Using it without installing yt-dlp**
Drop `yt-dlp.exe` and `ffmpeg.exe` into a `bin/` folder next to the app and
FetchWave will prefer those over anything on the PATH. Useful for a portable
setup on a USB stick.

---

## For developers

```
server/
  index.js    Express API, SSE progress stream, settings + history
  ytdlp.js    yt-dlp wrapper: binary lookup, metadata, download jobs
public/
  index.html  markup
  styles.css  the visual system — platform accents live at the top
  app.js      client logic
  sw.js       service worker (offline shell)
scripts/
  platform-test.mjs   the per-platform check in "What works"
  make-icons.mjs      generates the PWA icons, no image dependencies
```

The server never fetches media itself. It drives yt-dlp and parses a
machine-readable progress stream, so progress, speed and ETA stay accurate
across yt-dlp releases rather than breaking when its output format changes.

---

## A note on what you download

FetchWave is a tool for getting media onto your own disk: your own uploads,
Creative Commons and public-domain material, things you have a licence for, or
content whose terms allow saving a copy. Respect copyright and each site's terms
of service. What you download is your call and your responsibility.

---

## Licence

MIT — see [LICENSE](LICENSE).

FetchWave is a front-end for [yt-dlp](https://github.com/yt-dlp/yt-dlp), which
does the actual work and deserves the credit.
