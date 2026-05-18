// Account / magic-link helpers. The data model is in src/lib/db/schema.ts
// (accounts, magic_links, players.account_id, worlds.reality_account_id).
//
// Lifecycle:
//   1. requestSignIn(email)
//        → getOrCreateAccount(email)
//        → issueMagicLink(account.id) returns a 32-byte hex token
//        → API caller emails the URL containing that token.
//   2. consumeMagicLink(token)
//        → validates expires_at + used_at NULL
//        → marks used_at = now()
//        → returns account.id (or null on any failure).
//   3. bindPlayerToAccount(cookieToken, accountId)
//        → consolidates: the cookie's player becomes "you" for this account.
//        See the in-function comment for the consolidation rules.
import "server-only";
import { and, eq, gt, ne } from "drizzle-orm";
import { db, schema, ensureSchema } from "@/lib/db";
import { newId } from "@/lib/ids";

/** Token lifetime. Short enough that a stolen email doesn't sit dangerous. */
const MAGIC_LINK_TTL_MS = 15 * 60 * 1000;
/** Per-email rate limit. Don't let someone hammer a victim's inbox. */
const MAGIC_LINK_RATE_WINDOW_MS = 60 * 1000;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Lazy-insert. Returns the account row. */
export async function getOrCreateAccount(email: string) {
  await ensureSchema();
  const normalized = normalizeEmail(email);
  const existing = await db
    .select()
    .from(schema.accounts)
    .where(eq(schema.accounts.email, normalized))
    .get();
  if (existing) return existing;
  const id = newId();
  await db
    .insert(schema.accounts)
    .values({ id, email: normalized })
    .run();
  return (await db
    .select()
    .from(schema.accounts)
    .where(eq(schema.accounts.id, id))
    .get())!;
}

/**
 * Throws { kind: "rate_limited" } if a link for this account was issued
 * within the last MAGIC_LINK_RATE_WINDOW_MS. Otherwise issues + returns the
 * new token.
 */
export async function issueMagicLink(accountId: string): Promise<string> {
  await ensureSchema();
  const since = new Date(
    Date.now() - MAGIC_LINK_RATE_WINDOW_MS,
  ).toISOString();
  const recent = await db
    .select()
    .from(schema.magicLinks)
    .where(
      and(
        eq(schema.magicLinks.accountId, accountId),
        gt(schema.magicLinks.createdAt, since),
      ),
    )
    .get();
  if (recent) {
    throw Object.assign(new Error("rate_limited"), { kind: "rate_limited" });
  }
  const token = makeToken();
  const expiresAt = new Date(Date.now() + MAGIC_LINK_TTL_MS).toISOString();
  await db
    .insert(schema.magicLinks)
    .values({
      id: newId(),
      accountId,
      token,
      expiresAt,
    })
    .run();
  return token;
}

/**
 * Validate a token and mark it used. Returns the account_id on success;
 * null for any failure (unknown token / expired / already used). Callers
 * should treat all three failure modes identically so the response doesn't
 * leak which case it is.
 */
export async function consumeMagicLink(
  token: string,
): Promise<string | null> {
  await ensureSchema();
  const link = await db
    .select()
    .from(schema.magicLinks)
    .where(eq(schema.magicLinks.token, token))
    .get();
  if (!link) return null;
  if (link.usedAt) return null;
  if (new Date(link.expiresAt).getTime() < Date.now()) return null;
  const now = new Date().toISOString();
  await db
    .update(schema.magicLinks)
    .set({ usedAt: now })
    .where(eq(schema.magicLinks.id, link.id))
    .run();
  return link.accountId;
}

/**
 * Consolidation flow. After a successful verify we need the cookie to map
 * to a single player that represents this account.
 *
 *   Case A — account already has an existing player row from another
 *            device. We REWRITE that row's cookie_token to the incoming
 *            cookie, then delete the cookie-bound player that the verify
 *            request started on. Net result: one player per account, and
 *            this cookie now points at it. authorPlayerId checks across
 *            devices continue to work because they all resolve to the same
 *            id.
 *
 *   Case B — account has no existing player. We just set this player's
 *            account_id.
 *
 * Note: the cookie token itself doesn't change here — only which player
 * row it points to. The browser keeps the same cookie.
 */
export async function bindPlayerToAccount(
  cookieToken: string,
  accountId: string,
): Promise<void> {
  await ensureSchema();
  const cookiePlayer = await db
    .select()
    .from(schema.players)
    .where(eq(schema.players.cookieToken, cookieToken))
    .get();
  if (!cookiePlayer) {
    // Should be impossible — the verify endpoint always runs ensurePlayer()
    // before getting here. If we hit this somehow, fail loud.
    throw new Error("bindPlayerToAccount: no player for cookie");
  }
  const accountPlayer = await db
    .select()
    .from(schema.players)
    .where(
      and(
        eq(schema.players.accountId, accountId),
        ne(schema.players.id, cookiePlayer.id),
      ),
    )
    .get();

  if (accountPlayer) {
    // Case A: rewrite the account-player's cookie to point here, then
    // delete the (now duplicate) cookie-player. We do delete BEFORE the
    // rewrite to dodge the unique cookie_token constraint that would
    // otherwise be violated when two rows share the same token mid-flight.
    await db
      .delete(schema.players)
      .where(eq(schema.players.id, cookiePlayer.id))
      .run();
    await db
      .update(schema.players)
      .set({ cookieToken, displayName: cookiePlayer.displayName })
      .where(eq(schema.players.id, accountPlayer.id))
      .run();
    return;
  }

  // Case B: just bind.
  await db
    .update(schema.players)
    .set({ accountId })
    .where(eq(schema.players.id, cookiePlayer.id))
    .run();
}

/** Clear the current cookie's player's account binding. Cookie stays. */
export async function unbindPlayer(cookieToken: string): Promise<void> {
  await ensureSchema();
  await db
    .update(schema.players)
    .set({ accountId: null })
    .where(eq(schema.players.cookieToken, cookieToken))
    .run();
}

/**
 * Reality check: is this player the Reality of this world? Pure — uses
 * account ids already on the player + world rows. No DB hit. The world
 * must have realityAccountId set (every world created on the new code
 * path does); old NULL rows fail closed.
 */
export function isRealityOf(
  player: { accountId: string | null },
  world: { realityAccountId: string | null },
): boolean {
  return (
    !!player.accountId &&
    !!world.realityAccountId &&
    player.accountId === world.realityAccountId
  );
}

/** Get the account row for a player (or null if anonymous). */
export async function getAccountForPlayer(
  player: { accountId: string | null },
) {
  if (!player.accountId) return null;
  await ensureSchema();
  return (
    (await db
      .select()
      .from(schema.accounts)
      .where(eq(schema.accounts.id, player.accountId))
      .get()) ?? null
  );
}

function makeToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
