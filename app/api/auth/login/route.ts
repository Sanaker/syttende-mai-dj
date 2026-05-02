import { NextResponse } from "next/server";
import { buildAuthorizeUrl } from "@/lib/spotify";
import { isAdmin } from "@/lib/guest";

export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Ikke logget inn som vert" }, { status: 401 });
  }
  const state = crypto.randomUUID();
  const url = buildAuthorizeUrl(state);
  const res = NextResponse.redirect(url);
  res.cookies.set("spotify_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  return res;
}
