import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/guest";
import { getSuggestion, removePending } from "@/lib/kv";

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Ikke vert" }, { status: 401 });
  const { id } = (await req.json().catch(() => ({}))) as { id?: string };
  if (!id) return NextResponse.json({ error: "Mangler id" }, { status: 400 });
  const s = await getSuggestion(id);
  if (!s) return NextResponse.json({ error: "Finnes ikke" }, { status: 404 });
  await removePending(s.id);
  return NextResponse.json({ ok: true });
}
