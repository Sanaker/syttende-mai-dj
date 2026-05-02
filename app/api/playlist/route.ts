import { NextResponse } from "next/server";
import { getPlaylistTracks, trackToCard } from "@/lib/spotify";
import { getSettings, isBlocked } from "@/lib/kv";
import { getOrCreateGuestId } from "@/lib/guest";

export async function GET() {
  await getOrCreateGuestId();
  const settings = await getSettings();
  const playlistId = settings.playlistId || process.env.NEXT_PUBLIC_PLAYLIST_ID || "";
  if (!playlistId) return NextResponse.json({ tracks: [] });
  try {
    const items = await getPlaylistTracks(playlistId, 100);
    const cards = items.map(trackToCard);
    const filtered = (
      await Promise.all(
        cards.map(async (c) => ((await isBlocked(c.id, c.artistIds)) ? null : c))
      )
    ).filter((c): c is NonNullable<typeof c> => !!c);
    return NextResponse.json({ tracks: filtered });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
