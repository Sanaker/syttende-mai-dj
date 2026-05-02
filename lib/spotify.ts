import {
  CurrentlyPlaying,
  HostTokens,
  SpotifyPlaylistTracksResponse,
  SpotifySearchResponse,
  SpotifyTrack,
} from "./types";
import { getHostTokens, setHostTokens } from "./kv";

const TOKEN_URL = "https://accounts.spotify.com/api/token";
const API = "https://api.spotify.com/v1";

export const SCOPES = [
  "user-modify-playback-state",
  "user-read-playback-state",
  "user-read-currently-playing",
  "playlist-read-private",
].join(" ");

function basicAuth(): string {
  const id = process.env.SPOTIFY_CLIENT_ID!;
  const secret = process.env.SPOTIFY_CLIENT_SECRET!;
  return "Basic " + Buffer.from(`${id}:${secret}`).toString("base64");
}

export function buildAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.SPOTIFY_CLIENT_ID!,
    scope: SCOPES,
    redirect_uri: process.env.SPOTIFY_REDIRECT_URI!,
    state,
  });
  return `https://accounts.spotify.com/authorize?${params.toString()}`;
}

export async function exchangeCodeForTokens(code: string): Promise<HostTokens> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: process.env.SPOTIFY_REDIRECT_URI!,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuth(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    scope: string;
  };
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000 - 60_000,
    scope: data.scope,
  };
}

async function refresh(refreshToken: string): Promise<HostTokens> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuth(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Refresh failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope: string;
  };
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? refreshToken,
    expiresAt: Date.now() + data.expires_in * 1000 - 60_000,
    scope: data.scope,
  };
}

export async function getValidAccessToken(): Promise<string | null> {
  const tokens = await getHostTokens();
  if (!tokens) return null;
  if (Date.now() < tokens.expiresAt) return tokens.accessToken;
  const fresh = await refresh(tokens.refreshToken);
  await setHostTokens(fresh);
  return fresh.accessToken;
}

async function spotify<T>(
  path: string,
  init: RequestInit = {},
  token?: string
): Promise<T> {
  const access = token ?? (await getValidAccessToken());
  if (!access) throw new Error("Vert ikke logget inn på Spotify");
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${access}`,
    },
    cache: "no-store",
  });
  if (res.status === 204) return undefined as T;
  const text = (await res.text()).trim();
  let data: unknown = undefined;
  if (text.length > 0) {
    try {
      data = JSON.parse(text);
    } catch {
      // Spotify returnerte ikke-JSON (f.eks. tom 200 fra queue-endepunktet).
      // Behandles som tom respons.
      data = undefined;
    }
  }
  if (!res.ok) {
    const apiMsg = (data as { error?: { message?: string } } | undefined)?.error?.message;
    const msg = apiMsg ?? (text || res.statusText);
    throw new Error(`Spotify ${res.status}: ${msg}`);
  }
  return data as T;
}

export async function searchTracks(q: string, limit = 20): Promise<SpotifyTrack[]> {
  if (!q.trim()) return [];
  const params = new URLSearchParams({ q, type: "track", limit: String(limit), market: "NO" });
  const data = await spotify<SpotifySearchResponse>(`/search?${params.toString()}`);
  return data.tracks.items;
}

export async function getCurrentlyPlaying(): Promise<CurrentlyPlaying> {
  const data = await spotify<{
    is_playing: boolean;
    progress_ms: number | null;
    item: SpotifyTrack | null;
    device?: { id: string; name: string; type: string };
  } | undefined>("/me/player");
  if (!data) return { isPlaying: false, track: null, device: null, progressMs: null };
  return {
    isPlaying: !!data.is_playing,
    track: data.item,
    device: data.device ?? null,
    progressMs: data.progress_ms,
  };
}

export async function getQueue(): Promise<{ currentlyPlaying: SpotifyTrack | null; queue: SpotifyTrack[] }> {
  const data = await spotify<{ currently_playing: SpotifyTrack | null; queue: SpotifyTrack[] }>(
    "/me/player/queue"
  );
  return { currentlyPlaying: data.currently_playing, queue: data.queue };
}

export async function addToQueue(uri: string): Promise<void> {
  const params = new URLSearchParams({ uri });
  await spotify<void>(`/me/player/queue?${params.toString()}`, { method: "POST" });
}

export async function getPlaylistTracks(playlistId: string, limit = 100): Promise<SpotifyTrack[]> {
  const params = new URLSearchParams({ limit: String(limit), market: "NO" });
  const data = await spotify<SpotifyPlaylistTracksResponse>(
    `/playlists/${playlistId}/tracks?${params.toString()}`
  );
  return data.items.map((i) => i.track).filter((t): t is SpotifyTrack => !!t);
}

// Hent ALLE spor i en spilleliste, paginert. Bruker `next`-cursoren fra Spotify.
// Stopper ved hardCap (default 2000) for sikkerhets skyld.
export async function getAllPlaylistTracks(
  playlistId: string,
  hardCap = 2000
): Promise<SpotifyTrack[]> {
  const collected: SpotifyTrack[] = [];
  let url:
    | string
    | null = `/playlists/${playlistId}/tracks?limit=100&market=NO&fields=items(track(id,uri,name,duration_ms,explicit,artists(id,name))),next`;
  while (url && collected.length < hardCap) {
    const data: SpotifyPlaylistTracksResponse = await spotify<SpotifyPlaylistTracksResponse>(url);
    for (const it of data.items) {
      if (it.track) collected.push(it.track);
      if (collected.length >= hardCap) break;
    }
    // `next` er en absolutt URL — gjør den om til en relativ path mot api.spotify.com/v1
    if (data.next) {
      const u = new URL(data.next);
      url = u.pathname.replace(/^\/v1/, "") + u.search;
    } else {
      url = null;
    }
  }
  return collected;
}

// Trekk ut playlist-ID fra URL / URI / råverdi.
export function parsePlaylistId(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  // spotify:playlist:ID
  const uriMatch = s.match(/^spotify:playlist:([A-Za-z0-9]+)$/);
  if (uriMatch) return uriMatch[1];
  // open.spotify.com/playlist/ID(?si=...)
  const urlMatch = s.match(/playlist\/([A-Za-z0-9]+)/);
  if (urlMatch) return urlMatch[1];
  // rå ID (alfanumerisk, typisk 22 tegn)
  if (/^[A-Za-z0-9]{16,40}$/.test(s)) return s;
  return null;
}

// Hent flere spor på én gang (Spotify tillater maks 50 IDs per kall).
export async function getTracksByIds(ids: string[]): Promise<SpotifyTrack[]> {
  if (!ids.length) return [];
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 50) chunks.push(ids.slice(i, i + 50));
  const results: SpotifyTrack[] = [];
  for (const chunk of chunks) {
    const params = new URLSearchParams({ ids: chunk.join(","), market: "NO" });
    const data = await spotify<{ tracks: (SpotifyTrack | null)[] }>(`/tracks?${params.toString()}`);
    for (const t of data.tracks) if (t) results.push(t);
  }
  return results;
}

// ----- Playlist track-id cache (for autoApproveFromPlaylist) -----
let _playlistCache: { id: string; ids: Set<string>; at: number } | null = null;
const PLAYLIST_CACHE_TTL_MS = 5 * 60 * 1000;

export async function isTrackInPlaylist(
  trackId: string,
  playlistIdArg?: string
): Promise<boolean> {
  const playlistId = playlistIdArg || process.env.NEXT_PUBLIC_PLAYLIST_ID || "";
  if (!playlistId) return false;
  const now = Date.now();
  if (
    !_playlistCache ||
    _playlistCache.id !== playlistId ||
    now - _playlistCache.at > PLAYLIST_CACHE_TTL_MS
  ) {
    try {
      const tracks = await getPlaylistTracks(playlistId, 100);
      _playlistCache = { id: playlistId, ids: new Set(tracks.map((t) => t.id)), at: now };
    } catch {
      _playlistCache = { id: playlistId, ids: new Set(), at: now };
    }
  }
  return _playlistCache.ids.has(trackId);
}

export function trackToCard(t: SpotifyTrack) {
  const img = t.album.images?.slice().sort((a, b) => a.width - b.width)[0]?.url ?? null;
  return {
    id: t.id,
    uri: t.uri,
    title: t.name,
    artists: t.artists.map((a) => a.name).join(", "),
    artistIds: t.artists.map((a) => a.id),
    albumArt: img,
    durationMs: t.duration_ms,
    explicit: !!t.explicit,
  };
}
