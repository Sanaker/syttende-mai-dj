import { NextRequest, NextResponse } from "next/server";
import { getOrCreateGuestId } from "@/lib/guest";
import { getSuggestion, updateSuggestion } from "@/lib/kv";

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const guestId = await getOrCreateGuestId();
  const s = await getSuggestion(id);
  if (!s || s.status !== "pending") {
    return NextResponse.json({ error: "Forslaget finnes ikke lenger" }, { status: 404 });
  }
  const idx = s.votes.indexOf(guestId);
  if (idx >= 0) s.votes.splice(idx, 1);
  else s.votes.push(guestId);
  await updateSuggestion(s);
  return NextResponse.json({ ok: true, votes: s.votes.length, youVoted: idx < 0 });
}
