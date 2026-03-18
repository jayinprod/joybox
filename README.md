# JOYBOX — Personal Music Player PWA

A personal music player PWA by JoyBoy. Streams MP3s directly from Backblaze B2.

## Stack
- **App hosting** → GitHub Pages (free)
- **Music storage** → Backblaze B2 (10GB free)
- **No backend / Worker needed**

## Files
- `index.html` — HTML structure
- `app.css` — all styles
- `app.js` — all logic + B2 integration
- `sw.js` — service worker (offline support)
- `manifest.json` — PWA config
- `icon-192.png` / `icon-512.png` — app icons

## Setup

### 1. Create Backblaze B2 bucket
- Sign up at backblaze.com (free, no card needed)
- Create a bucket e.g. `joybox-music` (Private)
- Go to **App Keys** → **Add Application Key**
- Select your bucket, Read Only access
- Save the `keyID` and `applicationKey`

### 2. Add GitHub Secrets
Go to your repo → **Settings → Secrets → Actions → New repository secret**

| Secret | Value |
|---|---|
| `B2_KEY_ID` | Your Backblaze keyID |
| `B2_APP_KEY` | Your Backblaze applicationKey |
| `B2_BUCKET` | Your bucket name e.g. `joybox-music` |
| `B2_ENDPOINT` | e.g. `s3.eu-central-003.backblazeb2.com` |
| `APP_PASSWORD` | Password to unlock the app |

### 3. Enable GitHub Pages
Repo → **Settings → Pages → Source: `gh-pages` branch → Save**

### 4. Push to main
```bash
git add .
git commit -m "init"
git push
```
GitHub Action runs automatically → injects secrets → deploys to gh-pages.

### 5. Install on Android
1. Open `https://jayinprod.github.io/joybox/` in Chrome
2. Three-dot menu → **Add to Home Screen**
3. Done!

### 6. Upload music to B2
- Go to Backblaze dashboard → your bucket
- Upload MP3s directly
- For playlists, create folders e.g. `chill/`, `workout/`
- Files inside folders automatically appear as playlist tabs in the app

## Features
- 🎵 Streams MP3s directly from Backblaze B2
- 🔒 Password gate on app open
- 📁 Auto playlist detection from B2 folders
- 📱 Lock screen controls (Media Session API)
- 🔀 Shuffle & repeat
- 💾 Blob caching (no re-download while app is open)
- 📶 Offline app shell after first load
