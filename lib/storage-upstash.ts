import { Redis } from "@upstash/redis";
import { DEFAULT_SETTINGS } from "./types";
import type { AppSettings, BlockedItem, HostTokens, Suggestion } from "./types";
import type { Storage } from "./storage";

let _redis: Redis | null = null;
function r(): Redis {
  if (_redis) return _redis;
  const url = process.env.UPSTASH_REDIS_REST_URL!;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN!;
  _redis = new Redis({ url, token });
  return _redis;
}

const K = {
  hostTokens: "host:tokens",
  suggestion: (id: string) => `suggestion:${id}`,
  pending: "suggestions:pending",
  approved: "suggestions:approved",
  recent: (id: string) => `tracks:recent:${id}`,
  blockedTrack: (id: string) => `blocked:track:${id}`,
  blockedArtist: (id: string) => `blocked:artist:${id}`,
  blockedIndex: "blocked:index",
  cooldown: (g: string) => `cooldown:${g}`,
  settings: "settings:app",
};

export const upstashStorage: Storage = {
  async getHostTokens() {
    return (await r().get<HostTokens>(K.hostTokens)) ?? null;
  },
  async setHostTokens(t) {
    await r().set(K.hostTokens, t);
  },
  async clearHostTokens() {
    await r().del(K.hostTokens);
  },

  async createSuggestion(s) {
    await r().set(K.suggestion(s.id), s);
    await r().zadd(K.pending, { score: s.createdAt, member: s.id });
  },
  async getSuggestion(id) {
    return (await r().get<Suggestion>(K.suggestion(id))) ?? null;
  },
  async updateSuggestion(s) {
    await r().set(K.suggestion(s.id), s);
    if (s.status !== "pending") {
      await r().zrem(K.pending, s.id);
      if (s.status === "approved") {
        await r().zadd(K.approved, { score: Date.now(), member: s.id });
      }
    }
  },
  async listPendingSuggestions() {
    const ids = await r().zrange<string[]>(K.pending, 0, -1);
    if (!ids.length) return [];
    const items = await Promise.all(ids.map((id) => r().get<Suggestion>(K.suggestion(id))));
    return items.filter((x): x is Suggestion => !!x && x.status === "pending");
  },
  async hasPendingFromGuest(guestId) {
    const list = await this.listPendingSuggestions();
    return list.some((s) => s.suggestedBy === guestId);
  },

  async markTrackRecent(trackId, ttl) {
    await r().set(K.recent(trackId), "1", { ex: ttl });
  },
  async isTrackRecent(trackId) {
    return !!(await r().get<string>(K.recent(trackId)));
  },

  async block(item) {
    const key = item.type === "track" ? K.blockedTrack(item.id) : K.blockedArtist(item.id);
    await r().set(key, item);
    await r().sadd(K.blockedIndex, `${item.type}:${item.id}`);
  },
  async unblock(type, id) {
    const key = type === "track" ? K.blockedTrack(id) : K.blockedArtist(id);
    await r().del(key);
    await r().srem(K.blockedIndex, `${type}:${id}`);
  },
  async listBlocked() {
    const refs = await r().smembers(K.blockedIndex);
    if (!refs.length) return [];
    const items = await Promise.all(
      refs.map((ref) => {
        const [type, id] = ref.split(":") as ["track" | "artist", string];
        return r().get<BlockedItem>(type === "track" ? K.blockedTrack(id) : K.blockedArtist(id));
      })
    );
    return items.filter((x): x is BlockedItem => !!x);
  },
  async isBlocked(trackId, artistIds) {
    const keys = [K.blockedTrack(trackId), ...artistIds.map((a) => K.blockedArtist(a))];
    const values = await Promise.all(keys.map((k) => r().exists(k)));
    return values.some((v) => v === 1);
  },

  async checkAndSetCooldown(guestId, seconds) {
    const set = await r().set(K.cooldown(guestId), "1", { nx: true, ex: seconds });
    if (set === "OK") return { ok: true };
    const ttl = await r().ttl(K.cooldown(guestId));
    return { ok: false, remainingSeconds: Math.max(1, ttl) };
  },

  async getSettings() {
    const raw = await r().get<AppSettings | string>(K.settings);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const obj = typeof raw === "string" ? (JSON.parse(raw) as Partial<AppSettings>) : (raw as Partial<AppSettings>);
    return { ...DEFAULT_SETTINGS, ...obj };
  },
  async updateSettings(patch) {
    const current = await this.getSettings();
    const next = { ...current, ...patch };
    await r().set(K.settings, next);
    return next;
  },
};
