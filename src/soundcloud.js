const { Readable } = require('stream');

const API_BASE = 'https://api-v2.soundcloud.com';
const CLIENT_ID_TTL = 24 * 60 * 60 * 1000;

let cachedClientId = null;
let cachedClientIdTs = 0;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function extractClientId() {
  // Allow env override
  if (process.env.SOUNDCLOUD_CLIENT_ID) return process.env.SOUNDCLOUD_CLIENT_ID;

  if (cachedClientId && Date.now() - cachedClientIdTs < CLIENT_ID_TTL) {
    return cachedClientId;
  }

  const res = await fetch('https://soundcloud.com');
  const html = await res.text();

  const scriptUrls = [];
  const re = /src="(https:\/\/a-v2\.sndcdn\.com\/assets\/[^"]+\.js)"/g;
  let m;
  while ((m = re.exec(html))) scriptUrls.push(m[1]);

  for (let i = scriptUrls.length - 1; i >= 0; i--) {
    const jsRes = await fetch(scriptUrls[i]);
    const js = await jsRes.text();
    const cidMatch = js.match(/client_id[:=]\s*"([a-zA-Z0-9]{32})"/);
    if (cidMatch) {
      cachedClientId = cidMatch[1];
      cachedClientIdTs = Date.now();
      return cachedClientId;
    }
  }
  throw new Error('Could not extract client_id from SoundCloud bundles');
}

function clearClientId() {
  cachedClientId = null;
  cachedClientIdTs = 0;
}

async function apiCall(url, retries = 5) {
  const clientId = await extractClientId();
  const sep = url.includes('?') ? '&' : '?';
  const fullUrl = url.startsWith('http') ? url : `${API_BASE}${url}`;
  const urlWithCid = `${fullUrl}${sep}client_id=${clientId}`;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(urlWithCid);

    if (res.ok) return res.json();

    if ((res.status === 401 || res.status === 403) && attempt === 0) {
      clearClientId();
      const freshId = await extractClientId();
      const retryUrl = `${fullUrl}${sep}client_id=${freshId}`;
      const retryRes = await fetch(retryUrl);
      if (retryRes.ok) return retryRes.json();
    }

    if (res.status === 429) {
      const wait = Math.min(1000 * 2 ** attempt, 30000);
      await sleep(wait);
      continue;
    }

    throw new Error(`API ${res.status}: ${res.statusText} — ${fullUrl}`);
  }
  throw new Error(`API call failed after ${retries} retries — ${fullUrl}`);
}

async function resolveUrl(url) {
  return apiCall(`/resolve?url=${encodeURIComponent(url)}`);
}

async function getStreamUrl(track) {
  if (track.media && track.media.transcodings) {
    const aacHls = track.media.transcodings.find(
      t => t.format && t.format.protocol === 'hls' && t.format.mime_type && t.format.mime_type.includes('mp4')
    );
    if (aacHls) {
      const data = await apiCall(aacHls.url);
      return data.url;
    }

    const anyHls = track.media.transcodings.find(
      t => t.format && t.format.protocol === 'hls'
    );
    if (anyHls) {
      const data = await apiCall(anyHls.url);
      return data.url;
    }
  }

  const clientId = await extractClientId();
  const streamsRes = await fetch(`${API_BASE}/tracks/${track.id}/streams?client_id=${clientId}`);
  if (streamsRes.ok) {
    const streams = await streamsRes.json();
    if (streams.hls_aac_160_url) return streams.hls_aac_160_url;
    if (streams.hls_mp3_128_url) return streams.hls_mp3_128_url;
  }

  throw new Error('No available stream for this track');
}

function parseM3U8(text) {
  const lines = text.split('\n').map(l => l.trim());
  let initSegmentUrl = null;
  const segmentUrls = [];
  let isMasterPlaylist = false;
  let firstVariantUrl = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('#EXT-X-STREAM-INF')) {
      isMasterPlaylist = true;
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j] && !lines[j].startsWith('#')) {
          firstVariantUrl = lines[j];
          break;
        }
      }
      break;
    }

    if (line.startsWith('#EXT-X-MAP:')) {
      const uriMatch = line.match(/URI="([^"]+)"/);
      if (uriMatch) initSegmentUrl = uriMatch[1];
      continue;
    }

    if (line && !line.startsWith('#')) {
      segmentUrls.push(line);
    }
  }

  return { initSegmentUrl, segmentUrls, isMasterPlaylist, firstVariantUrl };
}

function resolveSegmentUrl(segmentUrl, playlistUrl) {
  if (segmentUrl.startsWith('http://') || segmentUrl.startsWith('https://')) {
    return segmentUrl;
  }
  const base = playlistUrl.substring(0, playlistUrl.lastIndexOf('/') + 1);
  return base + segmentUrl;
}

async function fetchPlaylist(streamUrl) {
  const res = await fetch(streamUrl);
  const text = await res.text();
  let parsed = parseM3U8(text);

  if (parsed.isMasterPlaylist && parsed.firstVariantUrl) {
    const variantUrl = resolveSegmentUrl(parsed.firstVariantUrl, streamUrl);
    const variantRes = await fetch(variantUrl);
    const variantText = await variantRes.text();
    parsed = parseM3U8(variantText);
    parsed.segmentUrls = parsed.segmentUrls.map(u => resolveSegmentUrl(u, variantUrl));
    if (parsed.initSegmentUrl) {
      parsed.initSegmentUrl = resolveSegmentUrl(parsed.initSegmentUrl, variantUrl);
    }
  } else {
    parsed.segmentUrls = parsed.segmentUrls.map(u => resolveSegmentUrl(u, streamUrl));
    if (parsed.initSegmentUrl) {
      parsed.initSegmentUrl = resolveSegmentUrl(parsed.initSegmentUrl, streamUrl);
    }
  }

  return parsed;
}

async function fetchSegment(url, retries = 3) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(url);
      if (res.ok) return Buffer.from(await res.arrayBuffer());
      if (res.status === 403) throw { expired: true };
      throw new Error(`Segment ${res.status}`);
    } catch (e) {
      if (e.expired) throw e;
      if (attempt < retries - 1) await sleep(1000 * 2 ** attempt);
      else throw e;
    }
  }
}

function createAudioStream(track) {
  const readable = new Readable({ read() {} });

  (async () => {
    try {
      let streamUrl = await getStreamUrl(track);
      let playlist = await fetchPlaylist(streamUrl);

      if (playlist.initSegmentUrl) {
        try {
          const initSeg = await fetchSegment(playlist.initSegmentUrl);
          readable.push(initSeg);
        } catch (e) {
          if (e.expired) {
            streamUrl = await getStreamUrl(track);
            playlist = await fetchPlaylist(streamUrl);
            if (playlist.initSegmentUrl) {
              const initSeg = await fetchSegment(playlist.initSegmentUrl);
              readable.push(initSeg);
            }
          } else {
            throw e;
          }
        }
      }

      for (let i = 0; i < playlist.segmentUrls.length; i++) {
        try {
          const seg = await fetchSegment(playlist.segmentUrls[i]);
          readable.push(seg);
        } catch (e) {
          if (e.expired) {
            streamUrl = await getStreamUrl(track);
            playlist = await fetchPlaylist(streamUrl);
            const seg = await fetchSegment(playlist.segmentUrls[i]);
            readable.push(seg);
          } else {
            throw e;
          }
        }
      }

      readable.push(null);
    } catch (err) {
      readable.destroy(err);
    }
  })();

  return readable;
}

module.exports = { resolveUrl, createAudioStream };
