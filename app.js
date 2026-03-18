const B2_KEY_ID   = '__B2_KEY_ID__'
const B2_APP_KEY  = '__B2_APP_KEY__'
const B2_BUCKET   = '__B2_BUCKET__'
const B2_ENDPOINT = '__B2_ENDPOINT__'
const APP_PASSWORD = '__APP_PASSWORD__'

const B2_BASE = `https://${B2_BUCKET}.${B2_ENDPOINT}`
const REGION  = B2_ENDPOINT.split('.')[1] // eu-central-003

let allSongs = []
let filteredSongs = []
let playlists = []
let activePlaylist = null
let currentIndex = -1
let currentSongName = null
let isPlaying = false
let isShuffle = false
let isRepeat = false
let shuffleOrder = []
let audio = new Audio()
let blobCache = {}

// ── Init ──────────────────────────────────────────────
// Always ask password on open
document.getElementById('setup-screen').style.display = 'flex'
setTimeout(() => document.getElementById('app-password-input')?.focus(), 100)

function saveConfig() {
  const entered = document.getElementById('app-password-input').value
  if (!entered) return showToast('Enter your password', true)
  if (entered !== APP_PASSWORD) return showToast('Wrong password', true)
  showApp()
}

function resetConfig() {
  if (!confirm('Lock and reset?')) return
  location.reload()
}

function showApp() {
  document.getElementById('setup-screen').style.display = 'none'
  document.getElementById('loading').style.display = 'flex'
  loadLibrary()
}

// ── AWS Signature V4 ───────────────────────────────────
async function hmac(key, msg) {
  const k = typeof key === 'string' ? new TextEncoder().encode(key) : key
  const ck = await crypto.subtle.importKey('raw', k, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', ck, new TextEncoder().encode(msg)))
}

async function hmacHex(key, msg) {
  return [...await hmac(key, msg)].map(b => b.toString(16).padStart(2, '0')).join('')
}

async function sha256hex(msg) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(msg))
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
}

async function getSigningKey(date) {
  const kDate    = await hmac(`AWS4${B2_APP_KEY}`, date)
  const kRegion  = await hmac(kDate, REGION)
  const kService = await hmac(kRegion, 's3')
  return hmac(kService, 'aws4_request')
}

async function b2Fetch(path) {
  const host = `${B2_BUCKET}.${B2_ENDPOINT}`
  const now  = new Date()
  const datestamp = now.toISOString().slice(0, 10).replace(/-/g, '')
  const timestamp = now.toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z'
  const payloadHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'

  const [pathOnly, qs = ''] = path.split('?')
  const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${timestamp}\n`
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date'
  const canonicalRequest = ['GET', pathOnly, qs, canonicalHeaders, signedHeaders, payloadHash].join('\n')

  const credentialScope = `${datestamp}/${REGION}/s3/aws4_request`
  const stringToSign = `AWS4-HMAC-SHA256\n${timestamp}\n${credentialScope}\n${await sha256hex(canonicalRequest)}`
  const signingKey = await getSigningKey(datestamp)
  const signature = await hmacHex(signingKey, stringToSign)

  const authorization = `AWS4-HMAC-SHA256 Credential=${B2_KEY_ID}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`

  return fetch(`${B2_BASE}${path}`, {
    headers: {
      'Host': host,
      'x-amz-date': timestamp,
      'x-amz-content-sha256': payloadHash,
      'Authorization': authorization
    }
  })
}

// ── Load library ──────────────────────────────────────
async function loadLibrary() {
  try {
    const res = await b2Fetch('/?list-type=2&max-keys=1000')
    if (!res.ok) throw new Error()
    const xml = await res.text()

    const keys = [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)]
      .map(m => m[1])
      .filter(k => /\.(mp3|ogg|wav|flac|m4a|aac)$/i.test(k))

    allSongs = keys.map(key => ({
      name: key,
      displayName: key.split('/').pop(),
      playlist: key.includes('/') ? key.split('/')[0] : null,
      size: null
    }))

    playlists = [...new Set(allSongs.filter(s => s.playlist).map(s => s.playlist))].sort()

    renderPlaylistTabs()
    filterAndRender(null)

    document.getElementById('loading').style.display = 'none'
    document.getElementById('app').style.display = 'flex'
    document.getElementById('bottom-nav').style.display = 'flex'
  } catch {
    document.getElementById('loading').style.display = 'none'
    document.getElementById('setup-screen').style.display = 'flex'
    showToast('Cannot connect to Backblaze B2', true)
  }
}

function showSetupScreen() {
  document.getElementById('loading').style.display = 'none'
  document.getElementById('setup-screen').style.display = 'flex'
}

// ── Playlist tabs ─────────────────────────────────────
function renderPlaylistTabs() {
  const bar = document.getElementById('playlist-bar')
  const tabs = [{ label: '♫ All', value: null }, ...playlists.map(p => ({ label: p, value: p }))]
  bar.innerHTML = tabs.map(t => `
    <div class="pl-tab ${t.value === activePlaylist ? 'active' : ''}"
         onclick="selectPlaylist(${t.value === null ? 'null' : `'${t.value}'`})">
      ${t.label}
    </div>`).join('')
}

function selectPlaylist(pl) {
  activePlaylist = pl
  renderPlaylistTabs()
  filterAndRender(pl)
}

function filterAndRender(pl) {
  filteredSongs = pl === null ? allSongs : allSongs.filter(s => s.playlist === pl)
  currentIndex = currentSongName
    ? filteredSongs.findIndex(s => s.name === currentSongName)
    : -1
  buildShuffleOrder()
  renderList()
  document.getElementById('list-title').textContent = pl || 'All Songs'
}

// ── Song list ─────────────────────────────────────────
function renderList() {
  const list = document.getElementById('song-list')
  document.getElementById('song-count').textContent = `${filteredSongs.length} tracks`

  if (!filteredSongs.length) {
    list.innerHTML = `<div class="empty-state">No songs found.<br>Upload MP3s to your B2 bucket${activePlaylist ? `<br>inside the <b>${activePlaylist}/</b> folder` : ''}.</div>`
    return
  }

  list.innerHTML = filteredSongs.map((s, i) => `
    <div class="song-item ${i === currentIndex ? 'active' : ''}" onclick="playSong(${i})">
      <div class="song-num">${i === currentIndex ? '▶' : i + 1}</div>
      <div class="song-details">
        <div class="song-title">${cleanName(s.displayName || s.name)}</div>
        <div class="song-meta">
          ${s.playlist && activePlaylist === null ? `<span class="song-pl-tag">${s.playlist}</span>` : ''}
        </div>
      </div>
    </div>`).join('')
}

function cleanName(f) { return f.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ') }

// ── Play ──────────────────────────────────────────────
async function playSong(index) {
  if (index < 0 || index >= filteredSongs.length) return
  currentIndex = index
  const song = filteredSongs[index]
  currentSongName = song.name

  document.getElementById('track-name').textContent = cleanName(song.displayName || song.name)
  document.getElementById('track-sub').textContent = song.name

  updateActiveItem()
  updateMediaSession(song)
  audio.pause(); audio.removeAttribute('src'); audio.load()
  setPlayIcon(false); isPlaying = false

  showToast(`Loading ${cleanName(song.displayName || song.name)}…`)

  try {
    let blobUrl = blobCache[song.name]
    if (!blobUrl) {
      const res = await b2Fetch(`/${encodeURIComponent(song.name)}`)
      if (!res.ok) throw new Error()
      blobUrl = URL.createObjectURL(await res.blob())
      blobCache[song.name] = blobUrl
    }
    audio.src = blobUrl
    audio.play()
    isPlaying = true
    setPlayIcon(true)
    startVisualizer()
  } catch {
    showToast('Failed to load track', true)
  }
}

function updateActiveItem() {
  document.querySelectorAll('.song-item').forEach((el, i) => {
    el.classList.toggle('active', i === currentIndex)
    el.querySelector('.song-num').textContent = i === currentIndex ? '▶' : i + 1
  })
  document.querySelector('.song-item.active')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
}

// ── Controls ──────────────────────────────────────────
function togglePlay() {
  if (!audio.currentSrc && currentIndex === -1) { if (filteredSongs.length) playSong(0); return }
  if (isPlaying) { audio.pause(); isPlaying = false; setPlayIcon(false); stopVisualizer() }
  else { audio.play(); isPlaying = true; setPlayIcon(true); startVisualizer() }
}

function setPlayIcon(p) {
  document.getElementById('play-icon').innerHTML = p
    ? '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>'
    : '<path d="M8 5v14l11-7z"/>'
}

function playNext() {
  if (!filteredSongs.length) return
  if (isShuffle) { const i = shuffleOrder.indexOf(currentIndex); playSong(shuffleOrder[(i + 1) % shuffleOrder.length]) }
  else playSong((currentIndex + 1) % filteredSongs.length)
}

function playPrev() {
  if (!filteredSongs.length) return
  if (audio.currentTime > 3) { audio.currentTime = 0; return }
  if (isShuffle) { const i = shuffleOrder.indexOf(currentIndex); playSong(shuffleOrder[(i - 1 + shuffleOrder.length) % shuffleOrder.length]) }
  else playSong((currentIndex - 1 + filteredSongs.length) % filteredSongs.length)
}

function toggleShuffle() {
  isShuffle = !isShuffle
  document.getElementById('shuffle-btn').classList.toggle('active', isShuffle)
  if (isShuffle) buildShuffleOrder()
}

function toggleRepeat() {
  isRepeat = !isRepeat
  audio.loop = isRepeat
  document.getElementById('repeat-btn').classList.toggle('active', isRepeat)
}

function setVolume(v) { audio.volume = v }

function seekTouch(e) {
  e.preventDefault()
  if (!audio.duration) return
  const r = document.getElementById('progress-bar').getBoundingClientRect()
  const touch = e.changedTouches[0]
  audio.currentTime = Math.max(0, Math.min(1, (touch.clientX - r.left) / r.width)) * audio.duration
}

function seek(e) {
  if (e.touches) return // handled by seekTouch
  if (!audio.duration) return
  const r = document.getElementById('progress-bar').getBoundingClientRect()
  audio.currentTime = ((e.clientX - r.left) / r.width) * audio.duration
}

function buildShuffleOrder() {
  shuffleOrder = [...Array(filteredSongs.length).keys()].sort(() => Math.random() - 0.5)
}

// ── Audio events ──────────────────────────────────────
audio.addEventListener('ended', () => { if (!isRepeat) playNext() })

audio.addEventListener('timeupdate', () => {
  if (!audio.duration) return
  document.getElementById('progress-fill').style.width = (audio.currentTime / audio.duration * 100) + '%'
  document.getElementById('time-current').textContent = fmt(audio.currentTime)
  document.getElementById('time-total').textContent = fmt(audio.duration)
})

function fmt(s) {
  if (isNaN(s)) return '0:00'
  return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`
}

function startVisualizer() {}
function stopVisualizer() {}

// ── Media Session ─────────────────────────────────────
function updateMediaSession(song) {
  if (!('mediaSession' in navigator)) return
  navigator.mediaSession.metadata = new MediaMetadata({
    title: cleanName(song.displayName || song.name),
    artist: song.playlist || 'JOYBOX',
    album: 'My Library'
  })
  navigator.mediaSession.setActionHandler('play', () => { audio.play(); isPlaying = true })
  navigator.mediaSession.setActionHandler('pause', () => { audio.pause(); isPlaying = false })
  navigator.mediaSession.setActionHandler('nexttrack', playNext)
  navigator.mediaSession.setActionHandler('previoustrack', playPrev)
}

// ── Nav ───────────────────────────────────────────────
function switchTab(tab) {
  document.getElementById('nav-library').classList.toggle('active', tab === 'library')
  document.getElementById('nav-playlists').classList.toggle('active', tab === 'playlists')
  if (tab === 'playlists') document.getElementById('playlist-bar').scrollIntoView({ behavior: 'smooth' })
}

// ── Toast ─────────────────────────────────────────────
let toastTimer = null
function showToast(msg, isError = false) {
  if (!msg) return
  const t = document.getElementById('toast')
  t.textContent = msg
  t.classList.toggle('error', isError)
  t.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    t.classList.remove('show')
    setTimeout(() => { t.textContent = '' }, 300)
  }, 2500)
}

// ── Service Worker ────────────────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {})
}
