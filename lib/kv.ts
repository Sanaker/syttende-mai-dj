// Velger lagrings-backend basert på env-variabler.
// - Hvis SUPABASE_URL er satt → Supabase Postgres
// - Ellers → Upstash Redis
import type { Storage } from "./storage";
import type { AppSettings, BlockedItem, HostTokens, Suggestion } from "./types";
import { upstashStorage } from "./storage-upstash";
import { supabaseStorage } from "./storage-supabase";

let _store: Storage | null = null;
function store(): Storage {
  if (_store) return _store;
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    _store = supabaseStorage;
  } else if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    _store = upstashStorage;
  } else {
    throw new Error(
      "Mangler lagrings-config. Sett enten SUPABASE_URL+SUPABASE_SERVICE_ROLE_KEY eller UPSTASH_REDIS_REST_URL+UPSTASH_REDIS_REST_TOKEN"
    );
  }
  return _store;
}

// ---------- Host tokens ----------
export const getHostTokens = (): Promise<HostTokens | null> => store().getHostTokens();
export const setHostTokens = (t: HostTokens): Promise<void> => store().setHostTokens(t);
export const clearHostTokens = (): Promise<void> => store().clearHostTokens();

// ---------- Suggestions ----------
export async function createSuggestion(s: Suggestion): Promise<void> {
  const settings = await store().getSettings();
  await store().createSuggestion(s);
  await store().markTrackRecent(s.trackId, settings.recentTrackTtlSeconds);
}
export const getSuggestion = (id: string) => store().getSuggestion(id);
export const updateSuggestion = (s: Suggestion) => store().updateSuggestion(s);
export const listPendingSuggestions = () => store().listPendingSuggestions();
export const hasPendingFromGuest = (g: string) => store().hasPendingFromGuest(g);

export async function movePendingToApproved(id: string): Promise<void> {
  const s = await store().getSuggestion(id);
  if (!s) return;
  s.status = "approved";
  await store().updateSuggestion(s);
}
export async function removePending(id: string): Promise<void> {
  const s = await store().getSuggestion(id);
  if (!s) return;
  s.status = "rejected";
  await store().updateSuggestion(s);
}

// ---------- Recent tracks ----------
export const isTrackRecent = (trackId: string) => store().isTrackRecent(trackId);

// ---------- Blocked ----------
export const block = (item: BlockedItem) => store().block(item);
export const unblock = (type: "track" | "artist", id: string) => store().unblock(type, id);
export const listBlocked = () => store().listBlocked();
export const isBlocked = (trackId: string, artistIds: string[]) =>
  store().isBlocked(trackId, artistIds);

// ---------- Cooldown ----------
export const checkAndSetCooldown = (guestId: string, seconds: number) =>
  store().checkAndSetCooldown(guestId, seconds);

// ---------- Settings ----------
export const getSettings = (): Promise<AppSettings> => store().getSettings();
export const updateSettings = (patch: Partial<AppSettings>): Promise<AppSettings> =>
  store().updateSettings(patch);
