// POST /api/auth/magic-link  { email, next? }
// Issues a magic-link token, sends the URL to the address. The response is
// always 200 (modulo rate-limit / bad input) so callers can't enumerate
// which emails are registered.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getOrCreateAccount,
  issueMagicLink,
  normalizeEmail,
} from "@/lib/auth-account";
import { sendMagicLink } from "@/lib/email";

const Body = z.object({
  email: z.string().email().max(254),
  /** Where to land after verifying. Defaults to "/". Validated below. */
  next: z.string().max(200).optional(),
});

function appUrl(): string {
  // Vercel sets VERCEL_URL but not the scheme; APP_URL takes precedence.
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

function safeNext(next: string | undefined): string {
  // Only accept relative paths starting with "/" — prevents open-redirect.
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/";
  return next;
}

export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "bad email" }, { status: 400 });
  }
  const email = normalizeEmail(parsed.data.email);
  const next = safeNext(parsed.data.next);

  try {
    const account = await getOrCreateAccount(email);
    const token = await issueMagicLink(account.id);
    const url = `${appUrl()}/api/auth/verify?token=${encodeURIComponent(
      token,
    )}&next=${encodeURIComponent(next)}`;
    await sendMagicLink(email, url);
  } catch (e) {
    const err = e as Error & { kind?: string };
    if (err.kind === "rate_limited") {
      return NextResponse.json(
        { error: "rate_limited" },
        { status: 429 },
      );
    }
    // Don't leak details. Log server-side for ops.
    // eslint-disable-next-line no-console
    console.error("magic-link issue failed", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
