import { NextRequest, NextResponse } from "next/server";
import { getOrCreateGuestId } from "@/lib/guest";
import {
  checkAndSetCooldown,
  createSuggestion,
  getSettings,
  hasPendingFromGuest,
  isBlocked,
  isTrackRecent,
  movePendingToApproved,
} from "@/lib/kv";
import { addToQueue, isTrackInPlaylist, searchTracks, trackToCard } from "@/lib/spotify";
import type { Suggestion } from "@/lib/types";

export async function POST(req: NextRequest) {
  const guestId = await getOrCreateGuestId();
  const body = (await req.json().catch(() => ({}))) as {
    trackId?: string;
    title?: string;
    artists?: string;
    albumArt?: string | null;
    durationMs?: number;
    artistIds?: string[];
    explicit?: boolean;
    uri?: string;
  };
  if (!body.trackId || !body.uri || !body.title) {
    return NextResponse.json({ error: "Mangler trackId/uri/title" }, { status: 400 });
  }

  const settings = await getSettings();
  const inPlaylist = settings.autoApproveFromPlaylist
    ? await isTrackInPlaylist(body.trackId, settings.playlistId || undefined)
    : false;
  const requireApproval = settings.approvalRequired && !inPlaylist;

  // Hindre spam: gjest med pending forslag kan ikke legge til ny (kun når godkjenning er på)
  if (requireApproval && (await hasPendingFromGuest(guestId))) {
    return NextResponse.json(
      { error: "Du har allerede et forslag i kø — vent til det blir behandlet" },
      { status: 429 }
    );
  }

  if (await isBlocked(body.trackId, body.artistIds ?? [])) {
    return NextResponse.json({ error: "Dette sporet er ikke tillatt" }, { status: 403 });
  }
  if (settings.blockExplicit && body.explicit) {
    return NextResponse.json(
      { error: "Eksplisitt innhold er deaktivert akkurat nå" },
      { status: 403 }
    );
  }
  if (
    settings.maxTrackDurationSeconds > 0 &&
    typeof body.durationMs === "number" &&
    body.durationMs > settings.maxTrackDurationSeconds * 1000
  ) {
    const mins = Math.floor(settings.maxTrackDurationSeconds / 60);
    const secs = settings.maxTrackDurationSeconds % 60;
    return NextResponse.json(
      { error: `Sporet er for langt (maks ${mins}m ${secs}s)` },
      { status: 413 }
    );
  }
  if (await isTrackRecent(body.trackId)) {
    return NextResponse.json({ error: "Sporet er allerede foreslått eller spilt nylig" }, { status: 409 });
  }

  const cd = await checkAndSetCooldown(guestId, settings.cooldownSeconds);
  if (!cd.ok) {
    return NextResponse.json(
      { error: `Vent ${cd.remainingSeconds}s før du foreslår igjen`, retryAfter: cd.remainingSeconds },
      { status: 429 }
    );
  }

  const s: Suggestion = {
    id: crypto.randomUUID(),
    trackId: body.trackId,
    uri: body.uri,
    title: body.title,
    artists: body.artists ?? "",
    albumArt: body.albumArt ?? null,
    durationMs: body.durationMs ?? 0,
    suggestedBy: guestId,
    createdAt: Date.now(),
    status: "pending",
    votes: [guestId],
  };
  await createSuggestion(s);

  if (!requireApproval) {
    try {
      await addToQueue(s.uri);
      await movePendingToApproved(s.id);
      return NextResponse.json({ ok: true, id: s.id, autoApproved: true });
    } catch (e) {
      // Auto-godkjenning feilet (ingen aktiv enhet?) — la det stå pending så vert kan håndtere
      return NextResponse.json(
        { ok: true, id: s.id, autoApproved: false, warning: (e as Error).message },
        { status: 202 }
      );
    }
  }

  return NextResponse.json({ ok: true, id: s.id });
}

// Server-side fallback: lookup full track for older clients (not used by UI but handy)
export async function GET(req: NextRequest) {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  const items = await searchTracks(q, 5);
  return NextResponse.json({ tracks: items.map(trackToCard) });
}
