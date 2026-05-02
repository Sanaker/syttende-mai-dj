import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/guest";
import { block, listBlocked, unblock } from "@/lib/kv";

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "Ikke vert" }, { status: 401 });
  return NextResponse.json({ blocked: await listBlocked() });
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Ikke vert" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as {
    type?: "track" | "artist";
    id?: string;
    label?: string;
  };
  if (!body.type || !body.id) return NextResponse.json({ error: "Mangler felt" }, { status: 400 });
  await block({
    type: body.type,
    id: body.id,
    label: body.label ?? body.id,
    blockedAt: Date.now(),
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Ikke vert" }, { status: 401 });
  const url = new URL(req.url);
  const type = url.searchParams.get("type") as "track" | "artist" | null;
  const id = url.searchParams.get("id");
  if (!type || !id) return NextResponse.json({ error: "Mangler params" }, { status: 400 });
  await unblock(type, id);
  return NextResponse.json({ ok: true });
}
