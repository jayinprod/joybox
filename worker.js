export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() })
    }

    // Auth check
    const token = request.headers.get('X-Auth-Token')
    if (token !== env.AUTH_TOKEN) {
      return new Response('Unauthorized', { status: 401, headers: corsHeaders() })
    }

    // ── GET /init → songs + playlists in one request ──
    if (url.pathname === '/init') {
      const objects = await env.MY_BUCKET.list()

      const songs = objects.objects
        .filter(o => o.key.match(/\.(mp3|ogg|wav|flac|m4a|aac)$/i))
        .map(o => ({
          name: o.key,
          displayName: o.key.split('/').pop(),
          playlist: o.key.includes('/') ? o.key.split('/')[0] : null,
          size: o.size,
        }))

      const playlists = [...new Set(
        songs.filter(s => s.playlist).map(s => s.playlist)
      )].sort()

      return Response.json({ songs, playlists }, { headers: corsHeaders() })
    }

    // ── GET /file/playlist/song.mp3 → stream file ──
    if (url.pathname.startsWith('/file/')) {
      const key = decodeURIComponent(url.pathname.replace('/file/', ''))
      const object = await env.MY_BUCKET.get(key)
      if (!object) return new Response('Not found', { status: 404, headers: corsHeaders() })
      return new Response(object.body, {
        headers: {
          ...corsHeaders(),
          'Content-Type': 'audio/mpeg',
          'Cache-Control': 'private, max-age=3600'
        }
      })
    }

    return new Response('Not found', { status: 404, headers: corsHeaders() })
  }
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'X-Auth-Token, Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json'
  }
}
