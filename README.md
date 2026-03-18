# JOYBOX — Personal Music Player PWA

## Files
- `index.html` — the app
- `manifest.json` — PWA config
- `sw.js` — service worker (offline support)
- `.github/workflows/deploy.yml` — auto-deploy pipeline
- `icon-192.png` / `icon-512.png` — app icons (add your own!)

## Setup

### 1. Add icons
Add two icon images to the folder:
- `icon-192.png` (192x192px)
- `icon-512.png` (512x512px)

You can generate free PWA icons at: https://favicon.io or https://realfavicongenerator.net

### 2. Add GitHub Actions secrets

Go to your repo → **Settings → Secrets and variables → Actions → New repository secret** and add these three:

| Secret name | Value |
|---|---|
| `WORKER_URL` | Your Cloudflare Worker URL, e.g. `https://music-worker.xxx.workers.dev` |
| `AUTH_TOKEN` | The secret token your Worker checks via `X-Auth-Token` header |
| `APP_PASSWORD` | The password users type on first launch to unlock the app |

> **Tip:** you can use the same value for `APP_PASSWORD` and `AUTH_TOKEN` to keep it simple.

### 3. Set GitHub Pages source

Go to your repo → **Settings → Pages → Source: `gh-pages` branch → Save**

### 4. Push to main — that's it

Every push to `main` automatically:
1. Runs the GitHub Action (~30 sec)
2. Injects your secrets into `index.html`
3. Publishes to `gh-pages`
4. Live app updates at `https://jayinprod.github.io/joybox/`

```bash
git add .
git commit -m "update"
git push
```

You never need to build or deploy manually.

### 5. Configure Cloudflare Worker
Make sure your worker has:
- `/init` endpoint → returns `{ songs, playlists }` JSON
- `/file/:key` endpoint → streams the file from R2
- `X-Auth-Token` header auth
- CORS headers

See `worker.js` for the reference implementation.

### 6. Install on Android
1. Open `https://jayinprod.github.io/joybox/` in Chrome
2. Tap three-dot menu → "Add to Home Screen"
3. Done! It installs like a native app.

### 7. First launch
Enter the `APP_PASSWORD` you set → tap Unlock.
The app remembers you in `localStorage` — no re-entry on return visits.
Use the settings icon to lock and reset.

## Features
- 🎵 Streams MP3s from Cloudflare R2 via Worker
- 🔒 Password gate + auth token — files stay private
- 📱 Lock screen controls (Media Session API)
- 🔀 Shuffle & repeat
- 💾 Blob caching (no re-download while app is open)
- 📶 App shell works offline after first load
