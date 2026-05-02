import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/guest";
import { isBlocked } from "@/lib/kv";
import { searchTracks, trackToCard } from "@/lib/spotify";

// Admin-søk: returnerer alle treff inkludert blokkerte (markert med isBlocked-flagg)
// så verten kan se og blokkere/avblokkere direkte.
export async function GET(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Ikke vert" }, { status: 401 });
  const q = new URL(req.url).searchParams.get("q") ?? "";
  if (!q.trim()) return NextResponse.json({ tracks: [] });
  try {
    const items = await searchTracks(q, 20);
    const cards = items.map(trackToCard);
    const annotated = await Promise.all(
      cards.map(async (c) => ({
        ...c,
        isBlocked: await isBlocked(c.id, c.artistIds),
      }))
    );
    return NextResponse.json({ tracks: annotated });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
