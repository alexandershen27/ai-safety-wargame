// Cookie-based anonymous identity. Token is issued in src/proxy.ts (so RSC pages
// don't have to mutate cookies). The DB row is created lazily on first read.
import "server-only";
import { cookies } from "next/headers";
import { db, schema, ensureSchema } from "./db";
import { eq } from "drizzle-orm";
import { newId } from "./ids";

const COOKIE_NAME = "wg_player";

export async function ensurePlayer(displayNameIfNew = "Anonymous") {
  await ensureSchema();
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) {
    throw new Error("Missing wg_player cookie. Proxy not running?");
  }
  const existing = await db
    .select()
    .from(schema.players)
    .where(eq(schema.players.cookieToken, token))
    .get();
  if (existing) return existing;
  const id = newId();
  await db
    .insert(schema.players)
    .values({ id, displayName: displayNameIfNew, cookieToken: token })
    .run();
  return (await db
    .select()
    .from(schema.players)
    .where(eq(schema.players.id, id))
    .get())!;
}

export async function currentPlayer() {
  await ensureSchema();
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return (
    (await db
      .select()
      .from(schema.players)
      .where(eq(schema.players.cookieToken, token))
      .get()) ?? null
  );
}

export async function setDisplayName(name: string) {
  const player = await ensurePlayer(name);
  if (player.displayName === name) return player;
  await db
    .update(schema.players)
    .set({ displayName: name })
    .where(eq(schema.players.id, player.id))
    .run();
  return { ...player, displayName: name };
}
