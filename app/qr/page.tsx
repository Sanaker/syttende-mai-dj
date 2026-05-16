"use client";

import { QRCodeSVG } from "qrcode.react";
import { useEffect, useRef, useState } from "react";

type NowPlayingPayload = {
  secondaryQrName?: string;
  secondaryQrUrl?: string;
  nowPlaying: {
    isPlaying: boolean;
    track: {
      title: string;
      artists: string;
      albumArt: string | null;
      durationMs: number;
    } | null;
    device: { name: string } | null;
    progressMs?: number;
  } | null;
};

function formatTime(ms: number) {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function QRPage() {
  const [siteUrl, setSiteUrl] = useState<string>(
    process.env.NEXT_PUBLIC_BASE_URL ?? (typeof window !== "undefined" ? window.location.origin : "")
  );
  const [customUrl, setCustomUrl] = useState<string>("");
  const [customName, setCustomName] = useState<string>("Ekstra QR");
  const [nowPlaying, setNowPlaying] = useState<NowPlayingPayload["nowPlaying"]>(null);

  useEffect(() => {
    const baseEnv = process.env.NEXT_PUBLIC_BASE_URL;
    const fallbackBase = window.location.origin;
    const resolvedBase = baseEnv && baseEnv.length > 0 ? baseEnv : fallbackBase;
    setSiteUrl(resolvedBase);

    const customEnv = process.env.NEXT_PUBLIC_SECONDARY_QR_URL;
    if (customEnv && customEnv.length > 0) setCustomUrl(customEnv);
  }, []);

  useEffect(() => {
    const refreshNowPlaying = async () => {
      try {
        const r = await fetch("/api/now-playing", { cache: "no-store" });
        if (!r.ok) return;
        const data = (await r.json()) as NowPlayingPayload;
        setNowPlaying(data.nowPlaying);
        if (typeof data.secondaryQrName === "string" && data.secondaryQrName.trim()) {
          setCustomName(data.secondaryQrName.trim());
        }
        if (typeof data.secondaryQrUrl === "string") {
          setCustomUrl(data.secondaryQrUrl.trim());
        }
      } catch {
        /* ignore */
      }
    };

    refreshNowPlaying();
    const id = window.setInterval(refreshNowPlaying, 5000);
    return () => window.clearInterval(id);
  }, []);

  // Smooth realtime progress interpolation
  const serverProgress = nowPlaying?.progressMs ?? 0;
  const isPlaying = nowPlaying?.isPlaying ?? false;
  const duration = nowPlaying?.track?.durationMs ?? 0;
  const trackTitle = nowPlaying?.track?.title;
  const baselineRef = useRef({ progress: 0, at: Date.now() });
  const [displayProgress, setDisplayProgress] = useState(0);

  useEffect(() => {
    baselineRef.current = { progress: serverProgress, at: Date.now() };
    setDisplayProgress(serverProgress);
  }, [serverProgress, trackTitle]);

  useEffect(() => {
    if (!isPlaying || !duration) return;
    const id = window.setInterval(() => {
      const elapsed = Date.now() - baselineRef.current.at;
      setDisplayProgress(Math.min(duration, baselineRef.current.progress + elapsed));
    }, 250);
    return () => window.clearInterval(id);
  }, [isPlaying, duration, trackTitle]);

  const progressPercent = nowPlaying?.track && duration
    ? (displayProgress / duration) * 100
    : 0;  return (
    <main className="min-h-screen flex flex-col bg-gradient-to-br from-norway-red via-slate-100 to-norway-blue p-4 sm:p-6">
      {/* Currently Playing Hero Section */}
      <section className="mb-6 sm:mb-8 w-full">
        {nowPlaying?.track ? (
          <div 
            className="relative rounded-3xl overflow-hidden shadow-2xl h-64 sm:h-80 group"
          >
            {/* Blurred background */}
            <div 
              className="absolute inset-0 rounded-3xl"
              style={{
                backgroundImage: nowPlaying.track.albumArt 
                  ? `url(${nowPlaying.track.albumArt})`
                  : undefined,
                backgroundSize: "cover",
                backgroundPosition: "center",
                filter: "blur(20px)",
                zIndex: 0,
              }}
            />
            
            {/* Dark overlay */}
            <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/70 to-black/90 z-10" />
            
            {/* Content */}
            <div className="relative h-full flex flex-col justify-end p-6 sm:p-8 text-white z-20">
              <div className="mb-4">
                <p className="text-sm sm:text-base font-semibold text-white/80 uppercase tracking-wide">
                  ▶ Spilles nå
                </p>
              </div>
              
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-2 leading-tight line-clamp-2">
                {nowPlaying.track.title}
              </h2>
              
              <p className="text-lg sm:text-xl text-white/90 mb-3 line-clamp-1">
                {nowPlaying.track.artists}
              </p>

              {nowPlaying.device?.name && (
                <p className="text-sm text-white/70 mb-4 flex items-center gap-2">
                  <span>●</span> {nowPlaying.device.name}
                </p>
              )}

              {/* Progress Bar */}
              <div className="w-full">
                <div className="w-full h-2 bg-white/20 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-norway-red to-white rounded-full"
                    style={{ width: `${progressPercent}%`, transition: "width 250ms linear" }}
                  />
                </div>
                <div className="flex justify-between text-xs text-white/60 mt-2">
                  <span>{formatTime(displayProgress)}</span>
                  <span>{formatTime(nowPlaying.track.durationMs)}</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-3xl bg-gradient-to-br from-slate-100 to-slate-200 p-8 sm:p-12 text-center shadow-lg">
            <p className="text-xl sm:text-2xl text-norway-blue font-semibold mb-2">
              Ingenting spilles akkurat nå
            </p>
            <p className="text-slate-600">
              Når musikken starter, vises den her.
            </p>
          </div>
        )}
      </section>

      {/* QR Codes Section */}
      <section className="flex-1 flex flex-col items-center w-full max-w-6xl mx-auto">
        <h3 className="text-white text-center text-lg sm:text-xl font-bold mb-6 drop-shadow-lg">
          Skann en av kodene under
        </h3>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full">
          {/* DJ-side QR */}
          <div className="rounded-3xl bg-white shadow-2xl p-6 sm:p-8 flex flex-col items-center transform transition hover:shadow-xl">
            <div className="w-full mb-4">
              <h4 className="text-xl sm:text-2xl font-bold text-norway-blue text-center">
                DJ-side
              </h4>
              <p className="text-sm text-slate-500 text-center mt-1">
                For spilleliste-kø
              </p>
            </div>
            
            {siteUrl ? (
              <>
                <div className="p-5 bg-gradient-to-br from-white to-slate-50 border-4 border-norway-red rounded-3xl shadow-lg animate-pulse-subtle">
                  <QRCodeSVG value={siteUrl} size={240} level="M" />
                </div>
                <p className="mt-4 text-xs text-slate-400 break-all text-center line-clamp-2">
                  {siteUrl}
                </p>
              </>
            ) : (
              <div className="w-full rounded-2xl border-2 border-dashed border-slate-300 p-6 text-sm text-slate-500 text-center">
                Kunne ikke finne base-URL.
                <br />
                Sett <strong>NEXT_PUBLIC_BASE_URL</strong> og last siden på nytt.
              </div>
            )}
          </div>

          {/* Secondary QR */}
          {customUrl && (
            <div className="rounded-3xl bg-white shadow-2xl p-6 sm:p-8 flex flex-col items-center transform transition hover:shadow-xl">
              <div className="w-full mb-4">
                <h4 className="text-xl sm:text-2xl font-bold text-norway-red text-center">
                  {customName}
                </h4>
                <p className="text-sm text-slate-500 text-center mt-1">
                  Engangskamera appen!
                </p>
              </div>
              
              <div className="p-5 bg-gradient-to-br from-white to-slate-50 border-4 border-norway-blue rounded-3xl shadow-lg animate-pulse-subtle">
                <QRCodeSVG value={customUrl} size={240} level="M" />
              </div>
              <p className="mt-4 text-xs text-slate-400 break-all text-center line-clamp-2">
                {customUrl}
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Footer */}
      <div className="mt-8 text-center">
        <p className="text-white text-xl sm:text-2xl font-bold drop-shadow-lg animate-wave">
          Hipp hipp hurra!
        </p>
      </div>
    </main>
  );
}
