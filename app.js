const WORKER_URL = '__WORKER_URL__'
const AUTH_TOKEN = '__AUTH_TOKEN__'
const APP_PASSWORD = '__APP_PASSWORD__'

let allSongs = []
let filteredSongs = []
let playlists = []
let activePlaylist = null
let currentIndex = -1
let currentSongName = null  // track playing song by name, not just index
let isPlaying = false
let isShuffle = false
let isRepeat = false
let shuffleOrder = []
let audio = new Audio()
let blobCache = {}

// ── Init ──────────────────────────────────────────────
if (localStorage.getItem('joybox_unlocked') === '1') {
  showApp()
} else {
  document.getElementById('setup-screen').style.display = 'flex'
  setTimeout(() => document.getElementById('app-password-input')?.focus(), 100)
}

function saveConfig() {
  const entered = document.getElementById('app-password-input').value
  if (!entered) return showToast('Enter your password', true)
  if (entered !== APP_PASSWORD) return showToast('Wrong password', true)
  localStorage.setItem('joybox_unlocked', '1')
  showApp()
}

function resetConfig() {
  if (!confirm('Lock and reset?')) return
  localStorage.removeItem('joybox_unlocked')
  location.reload()
}

function showApp() {
  document.getElementById('setup-screen').style.display = 'none'
  document.getElementById('loading').style.display = 'flex'
  loadLibrary()
}

// ── Load library ──────────────────────────────────────
async function loadLibrary() {
  try {
    const res = await fetch(`${WORKER_URL}/init`, {
      headers: { 'X-Auth-Token': AUTH_TOKEN }
    })

    if (res.status === 401) { showToast('Invalid token', true); return showSetupScreen() }
    if (!res.ok) throw new Error()

    const data = await res.json()
    allSongs = data.songs
    playlists = data.playlists

    renderPlaylistTabs()
    filterAndRender(null)

    document.getElementById('loading').style.display = 'none'
    document.getElementById('app').style.display = 'flex'
    document.getElementById('bottom-nav').style.display = 'flex'
  } catch {
    document.getElementById('loading').style.display = 'none'
    document.getElementById('setup-screen').style.display = 'flex'
    showToast('Cannot connect to worker', true)
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
  // re-resolve currentIndex based on currently playing song name
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
    list.innerHTML = `<div class="empty-state">No songs found.<br>Upload MP3s to your R2 bucket${activePlaylist ? `<br>inside the <b>${activePlaylist}/</b> folder` : ''}.</div>`
    return
  }

  list.innerHTML = filteredSongs.map((s, i) => `
    <div class="song-item ${i === currentIndex ? 'active' : ''}" onclick="playSong(${i})">
      <div class="song-num">${i === currentIndex ? '▶' : i + 1}</div>
      <div class="song-details">
        <div class="song-title">${cleanName(s.displayName || s.name)}</div>
        <div class="song-meta">
          ${s.playlist && activePlaylist === null ? `<span class="song-pl-tag">${s.playlist}</span>` : ''}
          <span>${formatSize(s.size)}</span>
        </div>
      </div>
    </div>`).join('')
}

function cleanName(f) { return f.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ') }
function formatSize(b) { return b ? (b / 1048576).toFixed(1) + ' MB' : '' }

// ── Play ──────────────────────────────────────────────
async function playSong(index) {
  if (index < 0 || index >= filteredSongs.length) return
  currentIndex = index
  const song = filteredSongs[index]
  currentSongName = song.name

  document.getElementById('track-name').textContent = cleanName(song.displayName || song.name)
  document.getElementById('track-sub').textContent = song.name

  const badge = document.getElementById('playlist-badge')
  badge.textContent = song.playlist || ''
  badge.style.display = song.playlist ? 'block' : 'none'

  updateActiveItem()
  updateMediaSession(song)
  audio.pause(); audio.src = ''
  setPlayIcon(false); isPlaying = false

  showToast(`Loading ${cleanName(song.displayName || song.name)}…`)

  try {
    let blobUrl = blobCache[song.name]
    if (!blobUrl) {
      const res = await fetch(`${WORKER_URL}/file/${encodeURIComponent(song.name)}`, {
        headers: { 'X-Auth-Token': AUTH_TOKEN }
      })
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
  if (!audio.src) { if (filteredSongs.length) playSong(0); return }
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

function seek(e) {
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

// ── Visualizer ────────────────────────────────────────
const vizEl = document.getElementById('visualizer')
for (let i = 0; i < 24; i++) {
  const b = document.createElement('div')
  b.className = 'viz-bar'; b.style.height = '4px'
  vizEl.appendChild(b)
}
const bars = vizEl.querySelectorAll('.viz-bar')
let vizInterval = null

function startVisualizer() {
  vizEl.classList.add('active')
  if (vizInterval) return
  vizInterval = setInterval(() => bars.forEach(b => { b.style.height = (4 + Math.random() * 44) + 'px' }), 120)
}

function stopVisualizer() {
  vizEl.classList.remove('active')
  clearInterval(vizInterval); vizInterval = null
  bars.forEach(b => b.style.height = '4px')
}

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
  const t = document.getElementById('toast')
  t.textContent = msg
  t.classList.toggle('error', isError)
  t.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => t.classList.remove('show'), 2500)
}

// ── Service Worker ────────────────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {})
}
