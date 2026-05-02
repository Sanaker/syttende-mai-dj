import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/guest";
import { getSettings, updateSettings } from "@/lib/kv";
import { parsePlaylistId } from "@/lib/spotify";
import type { AppSettings } from "@/lib/types";

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "Ikke vert" }, { status: 401 });
  return NextResponse.json(await getSettings());
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Ikke vert" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as Partial<AppSettings>;

  const patch: Partial<AppSettings> = {};
  if (typeof body.approvalRequired === "boolean") patch.approvalRequired = body.approvalRequired;
  if (typeof body.blockExplicit === "boolean") patch.blockExplicit = body.blockExplicit;
  if (typeof body.autoApproveFromPlaylist === "boolean")
    patch.autoApproveFromPlaylist = body.autoApproveFromPlaylist;
  if (typeof body.maxTrackDurationSeconds === "number" && body.maxTrackDurationSeconds >= 0)
    patch.maxTrackDurationSeconds = Math.min(3600, Math.floor(body.maxTrackDurationSeconds));
  if (typeof body.cooldownSeconds === "number" && body.cooldownSeconds >= 0)
    patch.cooldownSeconds = Math.min(3600, Math.floor(body.cooldownSeconds));
  if (typeof body.recentTrackTtlSeconds === "number" && body.recentTrackTtlSeconds >= 0)
    patch.recentTrackTtlSeconds = Math.min(86400, Math.floor(body.recentTrackTtlSeconds));
  if (typeof body.playlistId === "string") {
    const trimmed = body.playlistId.trim();
    if (trimmed === "") {
      patch.playlistId = "";
    } else {
      const parsed = parsePlaylistId(trimmed);
      if (!parsed) {
        return NextResponse.json({ error: "Ugyldig spilleliste-URL/ID" }, { status: 400 });
      }
      patch.playlistId = parsed;
    }
  }

  if (!Object.keys(patch).length) {
    return NextResponse.json({ error: "Ingen gyldige felter" }, { status: 400 });
  }

  const next = await updateSettings(patch);
  return NextResponse.json(next);
}
