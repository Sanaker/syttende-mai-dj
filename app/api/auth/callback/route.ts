import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens } from "@/lib/spotify";
import { setHostTokens } from "@/lib/kv";
import { isAdmin } from "@/lib/guest";

export async function GET(req: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Ikke logget inn som vert" }, { status: 401 });
  }
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieState = req.cookies.get("spotify_oauth_state")?.value;
  if (!code || !state || !cookieState || state !== cookieState) {
    return NextResponse.json({ error: "Ugyldig state eller manglende code" }, { status: 400 });
  }
  try {
    const tokens = await exchangeCodeForTokens(code);
    await setHostTokens(tokens);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
  const res = NextResponse.redirect(new URL("/admin", url.origin));
  res.cookies.delete("spotify_oauth_state");
  return res;
}
