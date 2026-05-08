// Cookie issuance only. We set a random token here so RSC pages can read it.
// The DB row for the player is lazily created on first authenticated request via
// ensurePlayer(), where mutating cookies would otherwise be illegal in an RSC.
import { NextResponse, type NextRequest } from "next/server";

const COOKIE_NAME = "wg_player";
const ONE_YEAR = 60 * 60 * 24 * 365;

function makeToken(): string {
  // Edge-runtime-safe random hex via webcrypto.
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function proxy(req: NextRequest) {
  const res = NextResponse.next();
  if (!req.cookies.get(COOKIE_NAME)) {
    res.cookies.set(COOKIE_NAME, makeToken(), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: ONE_YEAR,
    });
  }
  return res;
}

export const config = {
  // Skip Next internals and static assets.
  matcher: ["/((?!_next/|favicon|.*\\..*).*)"],
};
