// POST /api/auth/sign-out — clears players.account_id for the current cookie.
// Cookie stays; the player keeps their anonymous seats on this device. Re-
// signing in re-binds.
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { unbindPlayer } from "@/lib/auth-account";

const COOKIE_NAME = "wg_player";

export async function POST(_req: NextRequest) {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ ok: true });
  await unbindPlayer(token);
  return NextResponse.json({ ok: true });
}
