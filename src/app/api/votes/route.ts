import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, schema, ensureSchema } from "@/lib/db";
import { and, eq } from "drizzle-orm";
import { ensurePlayer } from "@/lib/auth";
import { newId } from "@/lib/ids";

const Body = z.object({
  actionId: z.string(),
  voterRoleId: z.string(),
  likelihood: z.number().int().min(0).max(100),
  tags: z.array(z.string().max(40)).max(8),
  objection: z.string().max(500).optional().nullable(),
});

export async function POST(req: NextRequest) {
  await ensureSchema();
  const player = await ensurePlayer();
  const p = Body.safeParse(await req.json());
  if (!p.success) return NextResponse.json({ error: "bad body" }, { status: 400 });

  const action = await db
    .select()
    .from(schema.actions)
    .where(eq(schema.actions.id, p.data.actionId))
    .get();
  if (!action) return new NextResponse("Action not found.", { status: 404 });
  const turn = await db
    .select()
    .from(schema.turns)
    .where(eq(schema.turns.id, action.turnId))
    .get();
  if (!turn) return new NextResponse("Turn missing.", { status: 404 });
  const seat = await db
    .select()
    .from(schema.seats)
    .where(
      and(
        eq(schema.seats.worldId, turn.worldId),
        eq(schema.seats.roleId, p.data.voterRoleId),
        eq(schema.seats.playerId, player.id),
      ),
    )
    .get();
  if (!seat) return new NextResponse("Not seated in that role.", { status: 403 });

  const existing = await db
    .select()
    .from(schema.votes)
    .where(
      and(
        eq(schema.votes.actionId, p.data.actionId),
        eq(schema.votes.voterPlayerId, player.id),
      ),
    )
    .get();
  if (existing) {
    await db
      .update(schema.votes)
      .set({
        likelihood: p.data.likelihood,
        tags: JSON.stringify(p.data.tags),
        objection: p.data.objection ?? null,
        voterRoleId: p.data.voterRoleId,
      })
      .where(eq(schema.votes.id, existing.id))
      .run();
    return NextResponse.json({ voteId: existing.id });
  }
  const id = newId();
  await db
    .insert(schema.votes)
    .values({
      id,
      actionId: p.data.actionId,
      voterPlayerId: player.id,
      voterRoleId: p.data.voterRoleId,
      likelihood: p.data.likelihood,
      tags: JSON.stringify(p.data.tags),
      objection: p.data.objection ?? null,
    })
    .run();
  return NextResponse.json({ voteId: id });
}
