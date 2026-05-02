import { NextRequest, NextResponse } from "next/server";
import { searchTracks, trackToCard } from "@/lib/spotify";
import { isBlocked } from "@/lib/kv";
import { getOrCreateGuestId } from "@/lib/guest";

export async function GET(req: NextRequest) {
  await getOrCreateGuestId();
  const q = new URL(req.url).searchParams.get("q") ?? "";
  if (!q.trim()) return NextResponse.json({ tracks: [] });
  try {
    const items = await searchTracks(q, 25);
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
