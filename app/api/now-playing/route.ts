import { NextResponse } from "next/server";
import { getCurrentlyPlaying, getQueue, trackToCard } from "@/lib/spotify";
import { getSettings, listPendingSuggestions } from "@/lib/kv";
import { getOrCreateGuestId } from "@/lib/guest";

export async function GET() {
  const guestId = await getOrCreateGuestId();
  try {
    const [np, q, pending, settings] = await Promise.all([
      getCurrentlyPlaying().catch(() => null),
      getQueue().catch(() => ({ currentlyPlaying: null, queue: [] })),
      listPendingSuggestions(),
      getSettings(),
    ]);
    return NextResponse.json({
      guestId,
      approvalRequired: settings.approvalRequired,
      secondaryQrName: settings.secondaryQrName,
      secondaryQrUrl: settings.secondaryQrUrl,
      nowPlaying: np
        ? {
            isPlaying: np.isPlaying,
            track: np.track ? trackToCard(np.track) : null,
            device: np.device,
            progressMs: np.progressMs,
          }
        : null,
      queue: q.queue.slice(0, 20).map(trackToCard),
      pending: pending
        .map((s) => ({
          id: s.id,
          trackId: s.trackId,
          title: s.title,
          artists: s.artists,
          albumArt: s.albumArt,
          durationMs: s.durationMs,
          createdAt: s.createdAt,
          votes: s.votes.length,
          youVoted: s.votes.includes(guestId),
          youSuggested: s.suggestedBy === guestId,
        }))
        .sort((a, b) => b.votes - a.votes || a.createdAt - b.createdAt),
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
