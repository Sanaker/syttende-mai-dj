import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/guest";
import { listBlocked, unblock } from "@/lib/kv";
import { getTracksByIds } from "@/lib/spotify";

// Fjern blokk på én artist OG alle blokkerte spor som har den artisten.
// Body: { artistId: string }
export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Ikke vert" }, { status: 401 });
  const { artistId } = (await req.json().catch(() => ({}))) as { artistId?: string };
  if (!artistId) return NextResponse.json({ error: "Mangler artistId" }, { status: 400 });

  // Fjern artist-blokken først
  await unblock("artist", artistId);

  // Slå opp alle blokkerte spor i Spotify, finn de som har denne artisten.
  const all = await listBlocked();
  const trackIds = all.filter((b) => b.type === "track").map((b) => b.id);
  let removedTracks = 0;
  if (trackIds.length) {
    try {
      const tracks = await getTracksByIds(trackIds);
      const matching = tracks.filter((t) => t.artists.some((a) => a.id === artistId));
      for (const t of matching) {
        await unblock("track", t.id);
        removedTracks++;
      }
    } catch (e) {
      return NextResponse.json(
        { ok: true, artistRemoved: true, removedTracks, warning: (e as Error).message },
        { status: 207 }
      );
    }
  }

  return NextResponse.json({ ok: true, artistRemoved: true, removedTracks });
}
