"use client";

import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";

type NowPlayingPayload = {
  nowPlaying: {
    isPlaying: boolean;
    track: {
      title: string;
      artists: string;
      albumArt: string | null;
    } | null;
    device: { name: string } | null;
  } | null;
};

export default function QRPage() {
  const [siteUrl, setSiteUrl] = useState<string>(
    process.env.NEXT_PUBLIC_BASE_URL ?? (typeof window !== "undefined" ? window.location.origin : "")
  );
  const [customUrl, setCustomUrl] = useState<string>("");
  const [nowPlaying, setNowPlaying] = useState<NowPlayingPayload["nowPlaying"]>(null);

  useEffect(() => {
    const baseEnv = process.env.NEXT_PUBLIC_BASE_URL;
    const fallbackBase = window.location.origin;
    const resolvedBase = baseEnv && baseEnv.length > 0 ? baseEnv : fallbackBase;
    setSiteUrl(resolvedBase);

    const query = new URLSearchParams(window.location.search);
    const queryCustom = query.get("custom");
    const customEnv = process.env.NEXT_PUBLIC_SECONDARY_QR_URL;
    const resolvedCustom =
      queryCustom && queryCustom.length > 0
        ? queryCustom
        : customEnv && customEnv.length > 0
          ? customEnv
          : "";
    setCustomUrl(resolvedCustom);
  }, []);

  useEffect(() => {
    const refreshNowPlaying = async () => {
      try {
        const r = await fetch("/api/now-playing", { cache: "no-store" });
        if (!r.ok) return;
        const data = (await r.json()) as NowPlayingPayload;
        setNowPlaying(data.nowPlaying);
      } catch {
        /* ignore */
      }
    };

    refreshNowPlaying();
    const id = window.setInterval(refreshNowPlaying, 5000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 bg-gradient-to-br from-norway-red via-white to-norway-blue">
      <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-5xl">
        <div className="text-5xl mb-2">🇳🇴</div>
        <h1 className="font-display text-4xl text-norway-blue text-center mb-1">
          17. mai-DJ
        </h1>
        <p className="text-center text-black/60 mb-6">
          Skann en av kodene under.
        </p>

        <section className="rounded-2xl border border-black/10 p-4 mb-6 bg-norway-blue/5">
          <h2 className="text-lg font-semibold text-norway-blue mb-2">Currently Playing</h2>
          {nowPlaying?.track ? (
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-lg overflow-hidden bg-white border border-black/10 flex-shrink-0">
                {nowPlaying.track.albumArt && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={nowPlaying.track.albumArt}
                    alt="Album cover"
                    className="w-full h-full object-cover"
                  />
                )}
              </div>
              <div className="min-w-0">
                <p className="font-medium text-black truncate">{nowPlaying.track.title}</p>
                <p className="text-sm text-black/70 truncate">{nowPlaying.track.artists}</p>
                {nowPlaying.device?.name && (
                  <p className="text-xs text-black/55">Enhet: {nowPlaying.device.name}</p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-black/60">Ingen sang spilles akkurat nå.</p>
          )}
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className="rounded-2xl border border-black/10 p-5 flex flex-col items-center bg-white">
            <h2 className="text-xl font-semibold text-norway-blue text-center mb-2">
              DJ-side for spilleliste-kø
            </h2>
            <p className="text-sm text-black/60 text-center mb-4">
              Gjester scanner denne for å foreslå låter.
            </p>
            {siteUrl ? (
              <>
                <div className="p-4 bg-white border-4 border-norway-red rounded-2xl">
                  <QRCodeSVG value={siteUrl} size={260} level="M" />
                </div>
                <p className="mt-4 text-xs text-black/50 break-all text-center">{siteUrl}</p>
              </>
            ) : (
              <div className="w-full rounded-xl border border-dashed border-black/20 p-5 text-sm text-black/55 text-center">
                Kunne ikke finne base-URL automatisk.
                <br />
                Sett <strong>NEXT_PUBLIC_BASE_URL</strong> og last siden pa nytt.
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-black/10 p-5 flex flex-col items-center bg-white">
            <h2 className="text-xl font-semibold text-norway-blue text-center mb-2">
              Ekstra QR
            </h2>
            <p className="text-sm text-black/60 text-center mb-4">
              Til valgfri lenke, f.eks. disposable camera.
            </p>
            {customUrl ? (
              <>
                <div className="p-4 bg-white border-4 border-norway-blue rounded-2xl">
                  <QRCodeSVG value={customUrl} size={260} level="M" />
                </div>
                <p className="mt-4 text-xs text-black/50 break-all text-center">{customUrl}</p>
              </>
            ) : (
              <div className="w-full rounded-xl border border-dashed border-black/20 p-5 text-sm text-black/55 text-center">
                Sett <strong>NEXT_PUBLIC_SECONDARY_QR_URL</strong> eller åpne siden med
                <br />
                <strong>?custom=https://din-lenke.no</strong>
              </div>
            )}
          </section>
        </div>
      </div>
      <p className="mt-6 text-white/90 text-sm drop-shadow">
        Hipp hipp hurra!
      </p>
    </main>
  );
}
