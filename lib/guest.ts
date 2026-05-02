import { cookies } from "next/headers";

const COOKIE = "dj_guest";
const ONE_YEAR = 60 * 60 * 24 * 365;

export async function getOrCreateGuestId(): Promise<string> {
  const jar = await cookies();
  const existing = jar.get(COOKIE)?.value;
  if (existing) return existing;
  const id = crypto.randomUUID();
  jar.set(COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ONE_YEAR,
  });
  return id;
}

export async function getGuestId(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(COOKIE)?.value ?? null;
}

const ADMIN_COOKIE = "dj_admin";
const ADMIN_TTL = 60 * 60 * 12;

export async function isAdmin(): Promise<boolean> {
  const jar = await cookies();
  const v = jar.get(ADMIN_COOKIE)?.value;
  return !!v && v === process.env.ADMIN_PASSWORD;
}

export async function setAdminCookie(password: string): Promise<boolean> {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || password !== expected) return false;
  const jar = await cookies();
  jar.set(ADMIN_COOKIE, password, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ADMIN_TTL,
  });
  return true;
}

export async function clearAdminCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(ADMIN_COOKIE);
}
