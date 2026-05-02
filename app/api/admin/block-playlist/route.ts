import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/guest";
import { block } from "@/lib/kv";
import { getAllPlaylistTracks, parsePlaylistId } from "@/lib/spotify";

// Blokker alle spor (og ev. artister) i en gitt Spotify-spilleliste.
// Body: { playlist: string, mode?: "tracks" | "artists" | "both" }
export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Ikke vert" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as {
    playlist?: string;
    mode?: "tracks" | "artists" | "both";
  };
  const playlistId = parsePlaylistId(body.playlist ?? "");
  if (!playlistId) {
    return NextResponse.json({ error: "Ugyldig spilleliste-URL/ID" }, { status: 400 });
  }
  const mode = body.mode ?? "tracks";

  let tracks;
  try {
    tracks = await getAllPlaylistTracks(playlistId);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
  if (!tracks.length) {
    return NextResponse.json({ error: "Fant ingen spor i spillelista" }, { status: 404 });
  }

  let trackCount = 0;
  let artistCount = 0;
  const seenArtists = new Set<string>();
  const now = Date.now();

  for (const t of tracks) {
    if (mode === "tracks" || mode === "both") {
      const label = `${t.name} – ${t.artists.map((a) => a.name).join(", ")}`;
      await block({ type: "track", id: t.id, label, blockedAt: now });
      trackCount++;
    }
    if (mode === "artists" || mode === "both") {
      for (const a of t.artists) {
        if (seenArtists.has(a.id)) continue;
        seenArtists.add(a.id);
        await block({ type: "artist", id: a.id, label: a.name, blockedAt: now });
        artistCount++;
      }
    }
  }

  return NextResponse.json({
    ok: true,
    playlistId,
    blockedTracks: trackCount,
    blockedArtists: artistCount,
    totalScanned: tracks.length,
  });
}
