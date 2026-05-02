"use client";

import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";

export default function QRPage() {
  const [url, setUrl] = useState<string>("");

  useEffect(() => {
    const env = process.env.NEXT_PUBLIC_BASE_URL;
    setUrl(env && env.length > 0 ? env : window.location.origin);
  }, []);

  if (!url) return null;

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 bg-gradient-to-br from-norway-red via-white to-norway-blue">
      <div className="bg-white rounded-3xl shadow-2xl p-8 flex flex-col items-center max-w-lg w-full">
        <div className="text-5xl mb-2">🇳🇴</div>
        <h1 className="font-display text-4xl text-norway-blue text-center mb-1">
          17. mai-DJ
        </h1>
        <p className="text-center text-black/60 mb-6">
          Skann og foreslå dine favorittsanger!
        </p>
        <div className="p-4 bg-white border-4 border-norway-red rounded-2xl">
          <QRCodeSVG value={url} size={280} level="M" />
        </div>
        <p className="mt-6 text-sm text-black/50 break-all text-center">{url}</p>
      </div>
      <p className="mt-6 text-white/90 text-sm drop-shadow">
        Hipp hipp hurra!
      </p>
    </main>
  );
}
