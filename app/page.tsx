"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Card = {
  id: string;
  uri: string;
  title: string;
  artists: string;
  artistIds: string[];
  albumArt: string | null;
  durationMs: number;
};

type PendingItem = {
  id: string;
  trackId: string;
  title: string;
  artists: string;
  albumArt: string | null;
  durationMs: number;
  votes: number;
  youVoted: boolean;
  youSuggested: boolean;
};

type NowPayload = {
  guestId: string;
  approvalRequired: boolean;
  nowPlaying: {
    isPlaying: boolean;
    track: Card | null;
    device: { name: string } | null;
  } | null;
  queue: Card[];
  pending: PendingItem[];
};

function formatDuration(ms: number) {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function Toast({ msg, kind }: { msg: string; kind: "ok" | "err" }) {
  return (
    <div
      className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full shadow-lg text-white animate-pop ${
        kind === "ok" ? "bg-norway-blue" : "bg-norway-red"
      }`}
    >
      {msg}
    </div>
  );
}

function TrackRow({
  card,
  onSuggest,
  busy,
}: {
  card: Card;
  onSuggest: (c: Card) => void;
  busy: boolean;
}) {
  return (
    <div className="card flex items-center gap-3">
      <div className="w-14 h-14 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
        {card.albumArt ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={card.albumArt} alt="" className="w-full h-full object-cover" />
        ) : null}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold truncate">{card.title}</div>
        <div className="text-sm text-black/60 truncate">{card.artists}</div>
        <div className="text-xs text-black/40">{formatDuration(card.durationMs)}</div>
      </div>
      <button className="btn-primary" disabled={busy} onClick={() => onSuggest(card)}>
        Foreslå
      </button>
    </div>
  );
}

export default function HomePage() {
  const [tab, setTab] = useState<"search" | "playlist" | "queue">("search");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Card[]>([]);
  const [searching, setSearching] = useState(false);
  const [playlist, setPlaylist] = useState<Card[]>([]);
  const [playlistLoaded, setPlaylistLoaded] = useState(false);
  const [now, setNow] = useState<NowPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ msg: string; kind: "ok" | "err" } | null>(null);
  const [confetti, setConfetti] = useState(false);
  const debounceRef = useRef<number | null>(null);
  const lastApprovedCount = useRef<number | null>(null);

  const showToast = useCallback((msg: string, kind: "ok" | "err" = "ok") => {
    setToast({ msg, kind });
    window.setTimeout(() => setToast(null), 2400);
  }, []);

  const refreshNow = useCallback(async () => {
    try {
      const r = await fetch("/api/now-playing", { cache: "no-store" });
      if (!r.ok) return;
      const data = (await r.json()) as NowPayload;
      setNow(data);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    refreshNow();
    const id = window.setInterval(refreshNow, 4000);
    return () => window.clearInterval(id);
  }, [refreshNow]);

  // Detect when a track you suggested gets approved (disappears from pending)
  const myPendingCount = useMemo(
    () => now?.pending.filter((p) => p.youSuggested).length ?? 0,
    [now]
  );
  useEffect(() => {
    if (lastApprovedCount.current === null) {
      lastApprovedCount.current = myPendingCount;
      return;
    }
    if (lastApprovedCount.current > myPendingCount) {
      setConfetti(true);
      showToast("Hipp hipp hurra! Sangen din er godkjent! 🇳🇴", "ok");
      window.setTimeout(() => setConfetti(false), 3500);
    }
    lastApprovedCount.current = myPendingCount;
  }, [myPendingCount, showToast]);

  // Debounced search
  useEffect(() => {
    if (tab !== "search") return;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    if (!q.trim()) {
      setResults([]);
      return;
    }
    debounceRef.current = window.setTimeout(async () => {
      setSearching(true);
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        const data = (await r.json()) as { tracks?: Card[] };
        setResults(data.tracks ?? []);
      } finally {
        setSearching(false);
      }
    }, 300);
  }, [q, tab]);

  // Load playlist on first switch
  useEffect(() => {
    if (tab !== "playlist" || playlistLoaded) return;
    (async () => {
      const r = await fetch("/api/playlist");
      const data = (await r.json()) as { tracks?: Card[] };
      setPlaylist(data.tracks ?? []);
      setPlaylistLoaded(true);
    })();
  }, [tab, playlistLoaded]);

  const suggest = useCallback(
    async (c: Card) => {
      setBusy(true);
      try {
        const r = await fetch("/api/suggestions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            trackId: c.id,
            uri: c.uri,
            title: c.title,
            artists: c.artists,
            artistIds: c.artistIds,
            albumArt: c.albumArt,
            durationMs: c.durationMs,
          }),
        });
        const data = (await r.json().catch(() => ({}))) as { error?: string; autoApproved?: boolean };
        if (!r.ok) {
          showToast(data.error ?? "Noe gikk galt", "err");
          return;
        }
        showToast(
          data.autoApproved
            ? "Sangen er lagt i køen 🎶"
            : "Sangen er sendt til vert for godkjenning 🎶",
          "ok"
        );
        refreshNow();
      } finally {
        setBusy(false);
      }
    },
    [refreshNow, showToast]
  );

  const vote = useCallback(
    async (id: string) => {
      const r = await fetch(`/api/suggestions/${id}/vote`, { method: "POST" });
      if (!r.ok) {
        const d = (await r.json().catch(() => ({}))) as { error?: string };
        showToast(d.error ?? "Kunne ikke stemme", "err");
        return;
      }
      refreshNow();
    },
    [refreshNow, showToast]
  );

  return (
    <main className="max-w-2xl mx-auto p-4 pb-24">
      <Header />

      <NowPlaying now={now} />

      <Tabs tab={tab} setTab={setTab} pending={now?.pending.length ?? 0} />

      {tab === "search" && (
        <section className="space-y-3">
          <input
            type="search"
            inputMode="search"
            placeholder="Søk etter artist eller sang..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-full rounded-2xl border border-black/10 px-4 py-3 text-base shadow-sm
              focus:outline-none focus:ring-2 focus:ring-norway-red/40"
          />
          {searching && <p className="text-sm text-black/50">Søker…</p>}
          <div className="space-y-2">
            {results.map((r, i) => (
              <TrackRow key={`${r.id}-${i}`} card={r} onSuggest={suggest} busy={busy} />
            ))}
          </div>
          {!searching && q && results.length === 0 && (
            <p className="text-sm text-black/50">Ingen treff (eller alle er blokkert)</p>
          )}
        </section>
      )}

      {tab === "playlist" && (
        <section className="space-y-2">
          {!playlistLoaded && <p className="text-sm text-black/50">Laster spilleliste…</p>}
          {playlistLoaded && playlist.length === 0 && (
            <p className="text-sm text-black/50">
              Ingen spilleliste konfigurert. Verten kan sette en under <em>/admin</em>.
            </p>
          )}
          {playlist.map((r, i) => (
            <TrackRow key={`${r.id}-${i}`} card={r} onSuggest={suggest} busy={busy} />
          ))}
        </section>
      )}

      {tab === "queue" && (
        <section className="space-y-4">
          {now?.pending.length ? (
            <div>
              <h2 className="font-display text-xl text-norway-blue mb-2">Venter på godkjenning</h2>
              <div className="space-y-2">
                {now.pending.map((p) => (
                  <div key={p.id} className="card flex items-center gap-3">
                    <div className="w-12 h-12 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                      {p.albumArt ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.albumArt} alt="" className="w-full h-full object-cover" />
                      ) : null}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold truncate">
                        {p.title} {p.youSuggested && <span className="text-xs text-norway-red">(din)</span>}
                      </div>
                      <div className="text-sm text-black/60 truncate">{p.artists}</div>
                    </div>
                    <button
                      onClick={() => vote(p.id)}
                      className={`flex flex-col items-center px-3 py-2 rounded-xl border transition ${
                        p.youVoted
                          ? "bg-norway-red text-white border-norway-red"
                          : "bg-white text-norway-red border-norway-red/30 hover:bg-norway-red/5"
                      }`}
                      aria-label="Stem"
                    >
                      <span className="text-lg leading-none">♥</span>
                      <span className="text-xs font-bold">{p.votes}</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div>
            <h2 className="font-display text-xl text-norway-blue mb-2">Spotify-kø</h2>
            {now?.queue.length ? (
              <div className="space-y-2">
                {now.queue.map((c, i) => (
                  <div key={`${c.id}-${i}`} className="card flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                      {c.albumArt ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={c.albumArt} alt="" className="w-full h-full object-cover" />
                      ) : null}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate text-sm">{c.title}</div>
                      <div className="text-xs text-black/60 truncate">{c.artists}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-black/50">Ingenting i køen ennå</p>
            )}
          </div>
        </section>
      )}

      {toast && <Toast msg={toast.msg} kind={toast.kind} />}
      {confetti && <Confetti />}
    </main>
  );
}

function Header() {
  return (
    <header className="mb-4">
      <div className="flag-stripe h-2 rounded-full mb-3" />
      <h1 className="font-display text-3xl text-norway-blue">
        <span className="animate-wave inline-block">🇳🇴</span> 17. mai-DJ
      </h1>
      <p className="text-sm text-black/60">Foreslå sanger til festen — verten godkjenner.</p>
    </header>
  );
}

function NowPlaying({ now }: { now: NowPayload | null }) {
  const t = now?.nowPlaying?.track;
  if (!t) {
    return (
      <div className="card mb-4 text-sm text-black/50">
        Ingen sang spiller akkurat nå
      </div>
    );
  }
  return (
    <div className="card mb-4 flex items-center gap-3 bg-gradient-to-r from-norway-blue/5 to-norway-red/5">
      <div className="w-16 h-16 rounded-xl overflow-hidden bg-gray-100 flex-shrink-0">
        {t.albumArt ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={t.albumArt} alt="" className="w-full h-full object-cover" />
        ) : null}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs uppercase tracking-wider text-norway-red font-bold">
          Nå spilles
        </div>
        <div className="font-semibold truncate">{t.title}</div>
        <div className="text-sm text-black/60 truncate">{t.artists}</div>
      </div>
    </div>
  );
}

function Tabs({
  tab,
  setTab,
  pending,
}: {
  tab: "search" | "playlist" | "queue";
  setTab: (t: "search" | "playlist" | "queue") => void;
  pending: number;
}) {
  const items: { id: typeof tab; label: string; badge?: number }[] = [
    { id: "search", label: "Søk" },
    { id: "playlist", label: "Spilleliste" },
    { id: "queue", label: "Kø", badge: pending || undefined },
  ];
  return (
    <div className="flex gap-1 mb-4 bg-black/5 rounded-full p-1">
      {items.map((i) => (
        <button
          key={i.id}
          onClick={() => setTab(i.id)}
          className={`flex-1 py-2 px-3 rounded-full text-sm font-semibold transition relative ${
            tab === i.id ? "bg-white text-norway-blue shadow" : "text-black/60"
          }`}
        >
          {i.label}
          {i.badge ? (
            <span className="absolute top-1 right-2 bg-norway-red text-white text-[10px] rounded-full w-5 h-5 inline-flex items-center justify-center">
              {i.badge}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

function Confetti() {
  const colors = ["#BA0C2F", "#FFFFFF", "#00205B"];
  const pieces = Array.from({ length: 60 }).map((_, i) => {
    const left = Math.random() * 100;
    const delay = Math.random() * 0.4;
    const duration = 2 + Math.random() * 1.5;
    const color = colors[i % colors.length];
    const size = 6 + Math.random() * 8;
    return (
      <span
        key={i}
        style={{
          position: "absolute",
          left: `${left}%`,
          top: "-10px",
          width: size,
          height: size * 0.5,
          background: color,
          borderRadius: 2,
          animation: `fall ${duration}s ${delay}s linear forwards`,
          transform: `rotate(${Math.random() * 360}deg)`,
        }}
      />
    );
  });
  return (
    <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden">
      {pieces}
      <style>{`@keyframes fall { to { transform: translateY(110vh) rotate(720deg); opacity: 0.6; } }`}</style>
    </div>
  );
}
