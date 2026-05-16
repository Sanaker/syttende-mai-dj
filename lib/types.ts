export type Suggestion = {
  id: string;
  trackId: string;
  uri: string;
  title: string;
  artists: string;
  albumArt: string | null;
  durationMs: number;
  suggestedBy: string; // guest UUID
  createdAt: number;
  status: "pending" | "approved" | "rejected";
  votes: string[]; // guest UUIDs that voted
};

export type HostTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // ms epoch
  scope: string;
};

export type BlockedItem = {
  type: "track" | "artist";
  id: string;
  label: string;
  blockedAt: number;
};

export type SpotifyTrack = {
  id: string;
  uri: string;
  name: string;
  duration_ms: number;
  explicit?: boolean;
  artists: { id: string; name: string }[];
  album: {
    name: string;
    images: { url: string; width: number; height: number }[];
  };
};

export type SpotifySearchResponse = {
  tracks: { items: SpotifyTrack[] };
};

export type SpotifyPlaylistTracksResponse = {
  items: { track: SpotifyTrack | null }[];
  next: string | null;
};

export type CurrentlyPlaying = {
  isPlaying: boolean;
  track: SpotifyTrack | null;
  device: { id: string; name: string; type: string } | null;
  progressMs: number | null;
};

export type AppSettings = {
  approvalRequired: boolean;
  blockExplicit: boolean;
  autoApproveFromPlaylist: boolean;
  maxTrackDurationSeconds: number; // 0 = ingen grense
  cooldownSeconds: number;
  recentTrackTtlSeconds: number;
  playlistId: string; // Spotify playlist ID som vises i gjest-UI; tom = ingen
  secondaryQrName: string;
  secondaryQrUrl: string;
};

export const DEFAULT_SETTINGS: AppSettings = {
  approvalRequired: true,
  blockExplicit: false,
  autoApproveFromPlaylist: false,
  maxTrackDurationSeconds: 0,
  cooldownSeconds: 300,
  recentTrackTtlSeconds: 7200,
  playlistId: "",
  secondaryQrName: "Ekstra QR",
  secondaryQrUrl: "",
};
