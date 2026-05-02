import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_SETTINGS } from "./types";
import type { AppSettings, BlockedItem, HostTokens, Suggestion } from "./types";
import type { Storage } from "./storage";

let _client: SupabaseClient | null = null;
function db(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  _client = createClient(url, key, { auth: { persistSession: false } });
  return _client;
}

type SuggestionRow = {
  id: string;
  track_id: string;
  uri: string;
  title: string;
  artists: string;
  album_art: string | null;
  duration_ms: number;
  suggested_by: string;
  created_at: string;
  status: "pending" | "approved" | "rejected";
  votes: string[];
};

function rowToSuggestion(r: SuggestionRow): Suggestion {
  return {
    id: r.id,
    trackId: r.track_id,
    uri: r.uri,
    title: r.title,
    artists: r.artists,
    albumArt: r.album_art,
    durationMs: r.duration_ms,
    suggestedBy: r.suggested_by,
    createdAt: new Date(r.created_at).getTime(),
    status: r.status,
    votes: r.votes,
  };
}

function suggestionToRow(s: Suggestion): SuggestionRow {
  return {
    id: s.id,
    track_id: s.trackId,
    uri: s.uri,
    title: s.title,
    artists: s.artists,
    album_art: s.albumArt,
    duration_ms: s.durationMs,
    suggested_by: s.suggestedBy,
    created_at: new Date(s.createdAt).toISOString(),
    status: s.status,
    votes: s.votes,
  };
}

export const supabaseStorage: Storage = {
  async getHostTokens() {
    const { data } = await db()
      .from("host_tokens")
      .select("access_token, refresh_token, expires_at, scope")
      .eq("id", 1)
      .maybeSingle();
    if (!data) return null;
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(data.expires_at).getTime(),
      scope: data.scope,
    };
  },
  async setHostTokens(t) {
    await db()
      .from("host_tokens")
      .upsert({
        id: 1,
        access_token: t.accessToken,
        refresh_token: t.refreshToken,
        expires_at: new Date(t.expiresAt).toISOString(),
        scope: t.scope,
      });
  },
  async clearHostTokens() {
    await db().from("host_tokens").delete().eq("id", 1);
  },

  async createSuggestion(s) {
    await db().from("suggestions").insert(suggestionToRow(s));
  },
  async getSuggestion(id) {
    const { data } = await db().from("suggestions").select("*").eq("id", id).maybeSingle();
    return data ? rowToSuggestion(data as SuggestionRow) : null;
  },
  async updateSuggestion(s) {
    await db()
      .from("suggestions")
      .update({ status: s.status, votes: s.votes })
      .eq("id", s.id);
  },
  async listPendingSuggestions() {
    const { data } = await db()
      .from("suggestions")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true });
    return (data ?? []).map((d) => rowToSuggestion(d as SuggestionRow));
  },
  async hasPendingFromGuest(guestId) {
    const { count } = await db()
      .from("suggestions")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .eq("suggested_by", guestId);
    return (count ?? 0) > 0;
  },

  async markTrackRecent(trackId, ttl) {
    const expires = new Date(Date.now() + ttl * 1000).toISOString();
    await db().from("recent_tracks").upsert({ track_id: trackId, expires_at: expires });
  },
  async isTrackRecent(trackId) {
    const { data } = await db()
      .from("recent_tracks")
      .select("expires_at")
      .eq("track_id", trackId)
      .maybeSingle();
    if (!data) return false;
    return new Date(data.expires_at).getTime() > Date.now();
  },

  async block(item) {
    await db().from("blocked").upsert({
      type: item.type,
      ext_id: item.id,
      label: item.label,
      blocked_at: new Date(item.blockedAt).toISOString(),
    });
  },
  async unblock(type, id) {
    await db().from("blocked").delete().eq("type", type).eq("ext_id", id);
  },
  async listBlocked() {
    const { data } = await db().from("blocked").select("*").order("blocked_at", { ascending: false });
    return (data ?? []).map((d) => ({
      type: d.type as "track" | "artist",
      id: d.ext_id as string,
      label: d.label as string,
      blockedAt: new Date(d.blocked_at as string).getTime(),
    }));
  },
  async isBlocked(trackId, artistIds) {
    const { data: t } = await db()
      .from("blocked")
      .select("ext_id")
      .eq("type", "track")
      .eq("ext_id", trackId)
      .maybeSingle();
    if (t) return true;
    if (!artistIds.length) return false;
    const { data: a } = await db()
      .from("blocked")
      .select("ext_id")
      .eq("type", "artist")
      .in("ext_id", artistIds)
      .limit(1);
    return !!(a && a.length > 0);
  },

  async checkAndSetCooldown(guestId, seconds) {
    const { data, error } = await db().rpc("set_cooldown", {
      p_guest_id: guestId,
      p_seconds: seconds,
    });
    if (error) throw new Error(`set_cooldown: ${error.message}`);
    if (data === true) return { ok: true };
    const { data: row } = await db()
      .from("cooldowns")
      .select("expires_at")
      .eq("guest_id", guestId)
      .maybeSingle();
    const remaining = row
      ? Math.max(1, Math.ceil((new Date(row.expires_at).getTime() - Date.now()) / 1000))
      : seconds;
    return { ok: false, remainingSeconds: remaining };
  },

  async getSettings() {
    const { data } = await db()
      .from("settings")
      .select("value")
      .eq("key", "app")
      .maybeSingle();
    const obj = ((data?.value ?? {}) as Partial<AppSettings>) || {};
    return { ...DEFAULT_SETTINGS, ...obj };
  },
  async updateSettings(patch) {
    const current = await this.getSettings();
    const next = { ...current, ...patch };
    await db().from("settings").upsert({
      key: "app",
      value: next,
      updated_at: new Date().toISOString(),
    });
    return next;
  },
};
