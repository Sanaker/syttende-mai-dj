import type { AppSettings, BlockedItem, HostTokens, Suggestion } from "./types";

export interface Storage {
  // Host tokens
  getHostTokens(): Promise<HostTokens | null>;
  setHostTokens(t: HostTokens): Promise<void>;
  clearHostTokens(): Promise<void>;

  // Suggestions
  createSuggestion(s: Suggestion): Promise<void>;
  getSuggestion(id: string): Promise<Suggestion | null>;
  updateSuggestion(s: Suggestion): Promise<void>;
  listPendingSuggestions(): Promise<Suggestion[]>;
  hasPendingFromGuest(guestId: string): Promise<boolean>;

  // Recent tracks (forhindre dobbelt-foreslåing 2 t)
  markTrackRecent(trackId: string, ttlSeconds: number): Promise<void>;
  isTrackRecent(trackId: string): Promise<boolean>;

  // Blocked
  block(item: BlockedItem): Promise<void>;
  unblock(type: "track" | "artist", id: string): Promise<void>;
  listBlocked(): Promise<BlockedItem[]>;
  isBlocked(trackId: string, artistIds: string[]): Promise<boolean>;

  // Cooldown
  checkAndSetCooldown(
    guestId: string,
    seconds: number
  ): Promise<{ ok: true } | { ok: false; remainingSeconds: number }>;

  // Settings (lagres som ett objekt under nøkkel "app")
  getSettings(): Promise<AppSettings>;
  updateSettings(patch: Partial<AppSettings>): Promise<AppSettings>;
}
