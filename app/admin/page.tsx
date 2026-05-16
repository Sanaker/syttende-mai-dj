"use client";

import { useCallback, useEffect, useState } from "react";

type PendingItem = {
  id: string;
  trackId: string;
  title: string;
  artists: string;
  albumArt: string | null;
  durationMs: number;
  votes: number;
  youSuggested: boolean;
};

type NowPayload = {
  pending: PendingItem[];
  nowPlaying: {
    isPlaying: boolean;
    track: { title: string; artists: string; albumArt: string | null } | null;
    device: { name: string } | null;
  } | null;
};

type AdminStatus = {
  connected: boolean;
  nowPlaying?: { isPlaying: boolean; track: { title: string; artists: string } | null; device: { name: string } | null } | null;
};

type Settings = {
  approvalRequired: boolean;
  blockExplicit: boolean;
  autoApproveFromPlaylist: boolean;
  maxTrackDurationSeconds: number;
  cooldownSeconds: number;
  recentTrackTtlSeconds: number;
  playlistId: string;
  secondaryQrName: string;
  secondaryQrUrl: string;
};

type Blocked = { type: "track" | "artist"; id: string; label: string; blockedAt: number };

type SearchResult = {
  id: string;
  uri: string;
  title: string;
  artists: string;
  artistIds: string[];
  albumArt: string | null;
  durationMs: number;
  explicit: boolean;
  isBlocked: boolean;
};

export default function AdminPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<AdminStatus | null>(null);
  const [now, setNow] = useState<NowPayload | null>(null);
  const [blocked, setBlocked] = useState<Blocked[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [playlistInput, setPlaylistInput] = useState("");
  const [playlistMode, setPlaylistMode] = useState<"tracks" | "artists" | "both">("tracks");
  const [blockingPlaylist, setBlockingPlaylist] = useState(false);
  const [playlistResult, setPlaylistResult] = useState<string | null>(null);
  const [blockedFilter, setBlockedFilter] = useState("");
  const [unblockBusyId, setUnblockBusyId] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    const [s, n, b, st] = await Promise.all([
      fetch("/api/admin/status").then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch("/api/now-playing").then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch("/api/admin/block").then((r) => (r.ok ? r.json() : { blocked: [] })).catch(() => ({ blocked: [] })),
      fetch("/api/admin/settings").then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    if (s === null) {
      setAuthed(false);
      return;
    }
    setAuthed(true);
    setStatus(s as AdminStatus);
    setNow(n as NowPayload);
    setBlocked((b as { blocked: Blocked[] }).blocked ?? []);
    if (st) setSettings(st as Settings);
  }, []);

  useEffect(() => {
    loadAll();
    const id = window.setInterval(loadAll, 4000);
    return () => window.clearInterval(id);
  }, [loadAll]);

  const login = useCallback(async () => {
    setError(null);
    const r = await fetch("/api/auth/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (!r.ok) {
      const d = (await r.json().catch(() => ({}))) as { error?: string };
      setError(d.error ?? "Innlogging feilet");
      return;
    }
    setPassword("");
    loadAll();
  }, [password, loadAll]);

  const logout = useCallback(async () => {
    await fetch("/api/auth/admin", { method: "DELETE" });
    setAuthed(false);
  }, []);

  const approve = useCallback(
    async (item: PendingItem) => {
      setBusyId(item.id);
      try {
        const r = await fetch("/api/admin/approve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: item.id }),
        });
        if (!r.ok) {
          const d = (await r.json().catch(() => ({}))) as { error?: string };
          alert(d.error ?? "Kunne ikke godkjenne");
        }
        loadAll();
      } finally {
        setBusyId(null);
      }
    },
    [loadAll]
  );

  const reject = useCallback(
    async (item: PendingItem) => {
      setBusyId(item.id);
      try {
        await fetch("/api/admin/reject", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: item.id }),
        });
        loadAll();
      } finally {
        setBusyId(null);
      }
    },
    [loadAll]
  );

  const blockTrack = useCallback(
    async (item: PendingItem) => {
      await fetch("/api/admin/block", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "track", id: item.trackId, label: `${item.title} – ${item.artists}` }),
      });
      await reject(item);
    },
    [reject]
  );

  const unblock = useCallback(async (b: Blocked) => {
    await fetch(`/api/admin/block?type=${b.type}&id=${encodeURIComponent(b.id)}`, { method: "DELETE" });
    loadAll();
  }, [loadAll]);

  const updateSetting = useCallback(
    async (patch: Partial<Settings>) => {
      if (!settings) return;
      const prev = settings;
      setSettings({ ...settings, ...patch }); // optimistisk
      setSavingSettings(true);
      try {
        const r = await fetch("/api/admin/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (r.ok) {
          const next = (await r.json()) as Settings;
          setSettings(next);
        } else {
          setSettings(prev);
        }
      } catch {
        setSettings(prev);
      } finally {
        setSavingSettings(false);
      }
    },
    [settings]
  );

  const runSearch = useCallback(async () => {
    const q = searchQ.trim();
    if (!q) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const r = await fetch(`/api/admin/search?q=${encodeURIComponent(q)}`);
      if (r.ok) {
        const d = (await r.json()) as { tracks: SearchResult[] };
        setSearchResults(d.tracks ?? []);
      }
    } finally {
      setSearching(false);
    }
  }, [searchQ]);

  const blockSearchTrack = useCallback(
    async (t: SearchResult) => {
      await fetch("/api/admin/block", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "track",
          id: t.id,
          label: `${t.title} – ${t.artists}`,
        }),
      });
      setSearchResults((prev) =>
        prev.map((p) => (p.id === t.id ? { ...p, isBlocked: true } : p))
      );
      loadAll();
    },
    [loadAll]
  );

  const blockSearchArtist = useCallback(
    async (t: SearchResult) => {
      if (!t.artistIds.length) return;
      const id = t.artistIds[0];
      const label = t.artists.split(",")[0]?.trim() ?? id;
      await fetch("/api/admin/block", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "artist", id, label }),
      });
      setSearchResults((prev) =>
        prev.map((p) => (p.artistIds.includes(id) ? { ...p, isBlocked: true } : p))
      );
      loadAll();
    },
    [loadAll]
  );

  const unblockSearchTrack = useCallback(
    async (t: SearchResult) => {
      await fetch(`/api/admin/block?type=track&id=${encodeURIComponent(t.id)}`, {
        method: "DELETE",
      });
      setSearchResults((prev) =>
        prev.map((p) => (p.id === t.id ? { ...p, isBlocked: false } : p))
      );
      loadAll();
    },
    [loadAll]
  );

  const unblockArtistAndTracks = useCallback(
    async (b: Blocked) => {
      if (b.type !== "artist") return;
      const ok = window.confirm(
        `Fjerne blokk på «${b.label}» og alle blokkerte spor fra denne artisten?`
      );
      if (!ok) return;
      setUnblockBusyId(`${b.type}:${b.id}`);
      try {
        const r = await fetch("/api/admin/unblock-artist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ artistId: b.id }),
        });
        if (!r.ok) {
          const d = (await r.json().catch(() => ({}))) as { error?: string };
          alert(d.error ?? "Kunne ikke fjerne blokk");
        }
        loadAll();
      } finally {
        setUnblockBusyId(null);
      }
    },
    [loadAll]
  );

  const blockPlaylist = useCallback(async () => {
    if (!playlistInput.trim()) return;
    setBlockingPlaylist(true);
    setPlaylistResult(null);
    try {
      const r = await fetch("/api/admin/block-playlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playlist: playlistInput.trim(), mode: playlistMode }),
      });
      const d = (await r.json().catch(() => ({}))) as {
        error?: string;
        blockedTracks?: number;
        blockedArtists?: number;
        totalScanned?: number;
      };
      if (!r.ok) {
        setPlaylistResult(d.error ?? "Kunne ikke blokkere spilleliste");
      } else {
        const parts: string[] = [];
        if (d.blockedTracks) parts.push(`${d.blockedTracks} spor`);
        if (d.blockedArtists) parts.push(`${d.blockedArtists} artister`);
        setPlaylistResult(
          `Blokkerte ${parts.join(" + ")} (av ${d.totalScanned ?? 0} skannet)`
        );
        setPlaylistInput("");
        loadAll();
      }
    } finally {
      setBlockingPlaylist(false);
    }
  }, [playlistInput, playlistMode, loadAll]);

  if (authed === null) {
    return <main className="p-6 text-black/60">Laster…</main>;
  }

  if (!authed) {
    return (
      <main className="max-w-sm mx-auto p-6">
        <h1 className="font-bold text-2xl text-norway-blue mb-4">Vert-innlogging</h1>
        <input
          type="password"
          placeholder="Passord"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && login()}
          className="w-full rounded-2xl border border-black/10 px-4 py-3 mb-3"
        />
        {error && <p className="text-sm text-norway-red mb-2">{error}</p>}
        <button className="btn-primary w-full" onClick={login}>
          Logg inn
        </button>
      </main>
    );
  }

  return (
    <main className="max-w-3xl mx-auto p-4 pb-24">
      <div className="flag-stripe h-2 rounded-full mb-3" />
      <div className="flex items-center justify-between mb-4">
        <h1 className="font-bold text-3xl text-norway-blue">Vert-dashboard</h1>
        <button className="btn-secondary" onClick={logout}>
          Logg ut
        </button>
      </div>

      <section className="card mb-4">
        <h2 className="font-semibold mb-2">Spotify-tilkobling</h2>
        {status?.connected ? (
          <div className="text-sm space-y-1">
            <p className="text-norway-blue">✓ Tilkoblet</p>
            {status.nowPlaying?.track ? (
              <p className="text-black/70">
                Spiller nå:{" "}
                <span className="font-medium">{status.nowPlaying.track.title}</span> –{" "}
                {status.nowPlaying.track.artists}{" "}
                {status.nowPlaying.device && (
                  <span className="text-black/50">
                    ({status.nowPlaying.device.name})
                  </span>
                )}
              </p>
            ) : (
              <p className="text-norway-red">
                ⚠ Ingen aktiv enhet. Åpne Spotify og start en sang for at kø skal fungere.
              </p>
            )}
            <a className="btn-secondary mt-2" href="/api/auth/login">
              Koble til på nytt
            </a>
          </div>
        ) : (
          <a className="btn-primary" href="/api/auth/login">
            Koble til Spotify
          </a>
        )}
      </section>

      <section className="card mb-4">
        <h2 className="font-semibold mb-3">Innstillinger</h2>
        <div className="space-y-3 text-sm">
          <PlaylistRow
            value={settings?.playlistId ?? ""}
            disabled={!settings || savingSettings}
            onCommit={(v) => updateSetting({ playlistId: v })}
          />
          <TextRow
            label="Ekstra QR-navn"
            description="Visningsnavn pa QR-siden, f.eks. Disposable Camera"
            value={settings?.secondaryQrName ?? "Ekstra QR"}
            placeholder="Ekstra QR"
            disabled={!settings || savingSettings}
            onCommit={(v) => updateSetting({ secondaryQrName: v || "Ekstra QR" })}
          />
          <TextRow
            label="Ekstra QR-lenke"
            description="Lenken som ekstra QR-koden skal peke til. Tom = skjules pa QR-siden."
            value={settings?.secondaryQrUrl ?? ""}
            placeholder="https://..."
            disabled={!settings || savingSettings}
            onCommit={(v) => updateSetting({ secondaryQrUrl: v })}
          />
          <ToggleRow
            label="Krev godkjenning"
            description={
              settings?.approvalRequired
                ? "Forslag venter på din godkjenning."
                : "Forslag legges direkte i køen."
            }
            checked={settings?.approvalRequired ?? true}
            disabled={!settings || savingSettings}
            onChange={(v) => updateSetting({ approvalRequired: v })}
          />
          <ToggleRow
            label="Auto-godkjenn fra spillelista"
            description="Hvis et foreslått spor ligger i 17. mai-spillelista, hopper det over godkjenning."
            checked={settings?.autoApproveFromPlaylist ?? false}
            disabled={!settings || savingSettings}
            onChange={(v) => updateSetting({ autoApproveFromPlaylist: v })}
          />
          <ToggleRow
            label="Blokker eksplisitt innhold"
            description="Avvis automatisk spor merket som «explicit» av Spotify."
            checked={settings?.blockExplicit ?? false}
            disabled={!settings || savingSettings}
            onChange={(v) => updateSetting({ blockExplicit: v })}
          />
          <NumberRow
            label="Maks lengde (sekunder)"
            description="0 = ingen grense. F.eks. 420 = 7 minutter."
            value={settings?.maxTrackDurationSeconds ?? 0}
            min={0}
            max={3600}
            disabled={!settings || savingSettings}
            onCommit={(v) => updateSetting({ maxTrackDurationSeconds: v })}
          />
          <NumberRow
            label="Cooldown per gjest (sekunder)"
            description="Hvor lenge en gjest må vente mellom forslag."
            value={settings?.cooldownSeconds ?? 300}
            min={0}
            max={3600}
            disabled={!settings || savingSettings}
            onCommit={(v) => updateSetting({ cooldownSeconds: v })}
          />
          <NumberRow
            label="Duplikat-vindu (sekunder)"
            description="Hvor lenge etter at et spor er foreslått/spilt det er låst for nye forslag."
            value={settings?.recentTrackTtlSeconds ?? 7200}
            min={0}
            max={86400}
            disabled={!settings || savingSettings}
            onCommit={(v) => updateSetting({ recentTrackTtlSeconds: v })}
          />
        </div>
      </section>

      <section className="card mb-4">
        <h2 className="font-semibold mb-2">Søk og blokker</h2>
        <p className="text-xs text-black/50 mb-2">
          Søk opp sanger/artister og blokker dem på forhånd. Blokkerte spor avvises automatisk hvis noen prøver å foreslå dem.
        </p>

        <div className="rounded-xl border border-black/10 p-3 mb-3 bg-norway-blue/5">
          <div className="text-sm font-medium mb-1">Blokker hel spilleliste</div>
          <p className="text-xs text-black/55 mb-2">
            Lim inn URL eller ID til en Spotify-spilleliste (f.eks. en Eurovision-liste) — alle sporene (eller artistene) blir blokkert med én gang.
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              placeholder="https://open.spotify.com/playlist/…"
              value={playlistInput}
              onChange={(e) => setPlaylistInput(e.target.value)}
              disabled={blockingPlaylist}
              className="flex-1 rounded-2xl border border-black/10 px-4 py-2 text-sm"
            />
            <select
              value={playlistMode}
              onChange={(e) =>
                setPlaylistMode(e.target.value as "tracks" | "artists" | "both")
              }
              disabled={blockingPlaylist}
              className="rounded-2xl border border-black/10 px-3 py-2 text-sm"
            >
              <option value="tracks">Bare spor</option>
              <option value="artists">Bare artister</option>
              <option value="both">Spor + artister</option>
            </select>
            <button
              className="btn-primary text-sm"
              onClick={blockPlaylist}
              disabled={blockingPlaylist || !playlistInput.trim()}
            >
              {blockingPlaylist ? "Blokkerer…" : "Blokker"}
            </button>
          </div>
          {playlistResult && (
            <div className="text-xs text-black/70 mt-2">{playlistResult}</div>
          )}
        </div>

        <div className="flex gap-2 mb-3">
          <input
            type="text"
            placeholder="Søk på låt, artist eller album…"
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runSearch()}
            className="flex-1 rounded-2xl border border-black/10 px-4 py-2"
          />
          <button className="btn-primary" onClick={runSearch} disabled={searching}>
            {searching ? "…" : "Søk"}
          </button>
        </div>
        {!!searchResults.length && (
          <div className="space-y-2">
            {searchResults.map((t, i) => (
              <div
                key={`${t.id}-${i}`}
                className={`flex items-center gap-3 rounded-xl border px-3 py-2 ${
                  t.isBlocked ? "border-norway-red/40 bg-norway-red/5" : "border-black/5 bg-white"
                }`}
              >
                <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                  {t.albumArt && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t.albumArt} alt="" className="w-full h-full object-cover" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate text-sm">
                    {t.title}
                    {t.explicit && (
                      <span className="ml-2 text-[10px] uppercase bg-black/70 text-white rounded px-1 py-px align-middle">
                        E
                      </span>
                    )}
                    {t.isBlocked && (
                      <span className="ml-2 text-[10px] uppercase bg-norway-red text-white rounded px-1 py-px align-middle">
                        Blokkert
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-black/60 truncate">{t.artists}</div>
                </div>
                <div className="flex flex-col gap-1">
                  {t.isBlocked ? (
                    <button
                      className="text-xs text-norway-blue hover:underline"
                      onClick={() => unblockSearchTrack(t)}
                    >
                      Fjern blokk
                    </button>
                  ) : (
                    <>
                      <button
                        className="text-xs text-norway-red hover:underline"
                        onClick={() => blockSearchTrack(t)}
                      >
                        Blokker spor
                      </button>
                      <button
                        className="text-xs text-norway-red/80 hover:underline"
                        onClick={() => blockSearchArtist(t)}
                      >
                        Blokker artist
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mb-6">
        <h2 className="font-bold text-xl text-norway-blue mb-2">
          Pending forslag ({now?.pending.length ?? 0})
        </h2>
        {!now?.pending.length && <p className="text-sm text-black/50">Ingen forslag akkurat nå</p>}
        <div className="space-y-2">
          {now?.pending.map((p) => (
            <div key={p.id} className="card flex items-center gap-3">
              <div className="w-12 h-12 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                {p.albumArt && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.albumArt} alt="" className="w-full h-full object-cover" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold truncate">{p.title}</div>
                <div className="text-sm text-black/60 truncate">{p.artists}</div>
                <div className="text-xs text-black/40">♥ {p.votes}</div>
              </div>
              <div className="flex flex-col gap-1">
                <button
                  className="btn-primary text-sm"
                  disabled={busyId === p.id}
                  onClick={() => approve(p)}
                >
                  Godkjenn
                </button>
                <button
                  className="btn-secondary text-sm"
                  disabled={busyId === p.id}
                  onClick={() => reject(p)}
                >
                  Avvis
                </button>
                <button
                  className="text-xs text-norway-red hover:underline"
                  onClick={() => blockTrack(p)}
                >
                  Avvis + blokker
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="font-bold text-xl text-norway-blue mb-2">
          Blokkerte ({blocked.length})
        </h2>
        {!blocked.length && <p className="text-sm text-black/50">Ingenting blokkert</p>}
        {!!blocked.length && (
          <input
            type="text"
            placeholder="Filtrer blokkerte (navn, artist…)"
            value={blockedFilter}
            onChange={(e) => setBlockedFilter(e.target.value)}
            className="w-full rounded-2xl border border-black/10 px-4 py-2 mb-2 text-sm"
          />
        )}
        <div className="space-y-1">
          {blocked
            .filter((b) =>
              !blockedFilter.trim()
                ? true
                : b.label.toLowerCase().includes(blockedFilter.trim().toLowerCase())
            )
            .map((b) => {
              const key = `${b.type}:${b.id}`;
              const busy = unblockBusyId === key;
              return (
                <div
                  key={key}
                  className="flex items-center justify-between gap-2 bg-white border border-black/5 rounded-xl px-3 py-2"
                >
                  <span className="text-sm min-w-0 truncate">
                    <span className="text-xs uppercase text-black/40 mr-2">{b.type}</span>
                    {b.label}
                  </span>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {b.type === "artist" && (
                      <button
                        className="text-xs text-norway-blue hover:underline disabled:opacity-50"
                        disabled={busy}
                        onClick={() => unblockArtistAndTracks(b)}
                        title="Fjern blokk på artisten og alle blokkerte spor fra denne artisten"
                      >
                        {busy ? "…" : "Fjern alt"}
                      </button>
                    )}
                    <button
                      className="text-xs text-norway-blue hover:underline disabled:opacity-50"
                      disabled={busy}
                      onClick={() => unblock(b)}
                    >
                      Fjern
                    </button>
                  </div>
                </div>
              );
            })}
          {!!blocked.length &&
            blocked.filter((b) =>
              !blockedFilter.trim()
                ? true
                : b.label.toLowerCase().includes(blockedFilter.trim().toLowerCase())
            ).length === 0 && (
              <p className="text-sm text-black/50">Ingen treff</p>
            )}
        </div>
      </section>
    </main>
  );
}

function TextRow({
  label,
  description,
  value,
  placeholder,
  disabled,
  onCommit,
}: {
  label: string;
  description?: string;
  value: string;
  placeholder?: string;
  disabled?: boolean;
  onCommit: (v: string) => void;
}) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  const commit = () => {
    const trimmed = local.trim();
    if (trimmed === value) return;
    onCommit(trimmed);
  };
  return (
    <div className="flex flex-col gap-1">
      <div>
        <div className="font-medium">{label}</div>
        {description && <div className="text-xs text-black/55">{description}</div>}
      </div>
      <input
        type="text"
        value={local}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm disabled:opacity-50"
      />
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="font-medium">{label}</div>
        {description && <div className="text-xs text-black/55">{description}</div>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-7 w-12 flex-shrink-0 rounded-full transition ${
          checked ? "bg-norway-red" : "bg-black/20"
        } disabled:opacity-50`}
      >
        <span
          className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition ${
            checked ? "translate-x-5" : "translate-x-0.5"
          } translate-y-0.5`}
        />
      </button>
    </div>
  );
}

function PlaylistRow({
  value,
  disabled,
  onCommit,
}: {
  value: string;
  disabled?: boolean;
  onCommit: (v: string) => void;
}) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  const commit = () => {
    if (local.trim() === value) return;
    onCommit(local.trim());
  };
  return (
    <div className="flex flex-col gap-1">
      <div>
        <div className="font-medium">17. mai-spilleliste</div>
        <div className="text-xs text-black/55">
          URL eller ID til Spotify-spillelista som vises i gjest-UI. Tomt = ingen spilleliste.
        </div>
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="https://open.spotify.com/playlist/…"
          value={local}
          disabled={disabled}
          onChange={(e) => setLocal(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          className="flex-1 rounded-xl border border-black/10 px-3 py-1 text-sm disabled:opacity-50"
        />
        {value && (
          <a
            href={`https://open.spotify.com/playlist/${value}`}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-norway-blue hover:underline self-center"
          >
            Åpne ↗
          </a>
        )}
      </div>
    </div>
  );
}

function NumberRow({
  label,
  description,
  value,
  min,
  max,
  disabled,
  onCommit,
}: {
  label: string;
  description?: string;
  value: number;
  min?: number;
  max?: number;
  disabled?: boolean;
  onCommit: (v: number) => void;
}) {
  const [local, setLocal] = useState<string>(String(value));
  // synk når prop endrer seg utenfra
  useEffect(() => setLocal(String(value)), [value]);
  const commit = () => {
    const n = parseInt(local, 10);
    if (Number.isNaN(n)) {
      setLocal(String(value));
      return;
    }
    const clamped = Math.max(min ?? 0, Math.min(max ?? Number.MAX_SAFE_INTEGER, n));
    setLocal(String(clamped));
    if (clamped !== value) onCommit(clamped);
  };
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0 flex-1">
        <div className="font-medium">{label}</div>
        {description && <div className="text-xs text-black/55">{description}</div>}
      </div>
      <input
        type="number"
        inputMode="numeric"
        value={local}
        min={min}
        max={max}
        disabled={disabled}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        className="w-24 rounded-xl border border-black/10 px-3 py-1 text-right disabled:opacity-50"
      />
    </div>
  );
}
