import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/guest";
import { getHostTokens } from "@/lib/kv";
import { getCurrentlyPlaying, trackToCard } from "@/lib/spotify";

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "Ikke vert" }, { status: 401 });
  const tokens = await getHostTokens();
  if (!tokens) return NextResponse.json({ connected: false });
  let nowPlaying = null;
  try {
    const np = await getCurrentlyPlaying();
    nowPlaying = {
      isPlaying: np.isPlaying,
      track: np.track ? trackToCard(np.track) : null,
      device: np.device,
    };
  } catch {
    /* ignore */
  }
  return NextResponse.json({ connected: true, scope: tokens.scope, nowPlaying });
}
