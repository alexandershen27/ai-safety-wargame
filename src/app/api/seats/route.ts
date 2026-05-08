// Take or release a seat. Multi-occupant allowed (a role can have multiple seats).
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, schema, ensureSchema } from "@/lib/db";
import { and, eq } from "drizzle-orm";
import { ensurePlayer } from "@/lib/auth";
import { newId } from "@/lib/ids";

const TakeBody = z.object({ worldId: z.string(), roleId: z.string() });
const ReleaseBody = z.object({ worldId: z.string(), roleId: z.string() });

export async function POST(req: NextRequest) {
  await ensureSchema();
  const player = await ensurePlayer();
  const parsed = TakeBody.safeParse(await req.json());
  if (!parsed.success)
    return NextResponse.json({ error: "bad body" }, { status: 400 });

  const role = await db
    .select()
    .from(schema.roles)
    .where(
      and(
        eq(schema.roles.id, parsed.data.roleId),
        eq(schema.roles.worldId, parsed.data.worldId),
      ),
    )
    .get();
  if (!role) return new NextResponse("Role not found.", { status: 404 });

  const existing = await db
    .select()
    .from(schema.seats)
    .where(
      and(
        eq(schema.seats.worldId, parsed.data.worldId),
        eq(schema.seats.roleId, parsed.data.roleId),
        eq(schema.seats.playerId, player.id),
      ),
    )
    .get();
  if (existing) return NextResponse.json({ seatId: existing.id });

  const seatId = newId();
  await db
    .insert(schema.seats)
    .values({
      id: seatId,
      worldId: parsed.data.worldId,
      roleId: parsed.data.roleId,
      playerId: player.id,
    })
    .run();
  return NextResponse.json({ seatId });
}

export async function DELETE(req: NextRequest) {
  await ensureSchema();
  const player = await ensurePlayer();
  const parsed = ReleaseBody.safeParse(await req.json());
  if (!parsed.success)
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  await db
    .delete(schema.seats)
    .where(
      and(
        eq(schema.seats.worldId, parsed.data.worldId),
        eq(schema.seats.roleId, parsed.data.roleId),
        eq(schema.seats.playerId, player.id),
      ),
    )
    .run();
  return NextResponse.json({ ok: true });
}
