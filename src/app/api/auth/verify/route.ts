// GET /api/auth/verify?token=...&next=/world/new
// Consumes a magic-link token, binds the current cookie's player to the
// account, then 302's to `next` (or "/"). All failure paths land on
// /sign-in?error=... so the user gets a readable message instead of raw JSON.
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { bindPlayerToAccount, consumeMagicLink } from "@/lib/auth-account";
import { ensurePlayer } from "@/lib/auth";

const COOKIE_NAME = "wg_player";

function safeNext(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/";
  return next;
}

function origin(req: NextRequest): string {
  return req.nextUrl.origin;
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const next = safeNext(req.nextUrl.searchParams.get("next"));
  if (!token) {
    return NextResponse.redirect(
      `${origin(req)}/sign-in?error=bad-link`,
    );
  }
  const accountId = await consumeMagicLink(token);
  if (!accountId) {
    // Could be expired / already used / unknown — same response for all.
    return NextResponse.redirect(
      `${origin(req)}/sign-in?error=bad-link`,
    );
  }

  // Ensure the player row exists (proxy already set the cookie). Then bind.
  await ensurePlayer();
  const jar = await cookies();
  const cookieToken = jar.get(COOKIE_NAME)?.value;
  if (!cookieToken) {
    // Cookie went missing between proxy and here — very unusual; just bail.
    return NextResponse.redirect(
      `${origin(req)}/sign-in?error=no-cookie`,
    );
  }
  await bindPlayerToAccount(cookieToken, accountId);
  return NextResponse.redirect(`${origin(req)}${next}`);
}
