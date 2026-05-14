// Action CRUD. POST = save draft / submit / resolve depending on `op`.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, schema, ensureSchema } from "@/lib/db";
import { and, eq } from "drizzle-orm";
import { ensurePlayer } from "@/lib/auth";
import { newId } from "@/lib/ids";

const SaveDraft = z.object({
  op: z.literal("draft"),
  worldId: z.string(),
  turnId: z.string(),
  roleId: z.string(),
  draftText: z.string().max(2000),
  actionId: z.string().optional(),
});
const Submit = z.object({
  op: z.literal("submit"),
  actionId: z.string(),
  text: z.string().min(1).max(2000),
});
const Resolve = z.object({
  op: z.literal("resolve"),
  actionId: z.string(),
  resolvedText: z.string().min(1).max(2000),
  resolvedOutcome: z.string().max(60).optional(),
});
// Skip = commit an action as "no action this turn". Convention: submittedAt
// set, submittedText empty. Doesn't need resolution. The endpoint creates
// the action row if it doesn't already exist (so a player can hit Skip
// without typing anything first).
const Skip = z.object({
  op: z.literal("skip"),
  worldId: z.string(),
  turnId: z.string(),
  roleId: z.string(),
  actionId: z.string().optional(),
});

export async function POST(req: NextRequest) {
  await ensureSchema();
  const player = await ensurePlayer();
  const body = await req.json();

  if (body.op === "draft") {
    const p = SaveDraft.safeParse(body);
    if (!p.success) return NextResponse.json({ error: "bad body" }, { status: 400 });
    const seat = await db
      .select()
      .from(schema.seats)
      .where(
        and(
          eq(schema.seats.worldId, p.data.worldId),
          eq(schema.seats.roleId, p.data.roleId),
          eq(schema.seats.playerId, player.id),
        ),
      )
      .get();
    if (!seat) return new NextResponse("Not seated in that role.", { status: 403 });

    if (p.data.actionId) {
      await db
        .update(schema.actions)
        .set({ draftText: p.data.draftText })
        .where(eq(schema.actions.id, p.data.actionId))
        .run();
      return NextResponse.json({ actionId: p.data.actionId });
    }
    const id = newId();
    await db
      .insert(schema.actions)
      .values({
        id,
        turnId: p.data.turnId,
        roleId: p.data.roleId,
        authorPlayerId: player.id,
        slot: 1,
        draftText: p.data.draftText,
      })
      .run();
    return NextResponse.json({ actionId: id });
  }

  if (body.op === "submit") {
    const p = Submit.safeParse(body);
    if (!p.success) return NextResponse.json({ error: "bad body" }, { status: 400 });
    const action = await db
      .select()
      .from(schema.actions)
      .where(eq(schema.actions.id, p.data.actionId))
      .get();
    if (!action) return new NextResponse("Action not found.", { status: 404 });
    if (action.authorPlayerId !== player.id)
      return new NextResponse("Not your action.", { status: 403 });
    if (action.submittedAt) return NextResponse.json({ ok: true });
    await db
      .update(schema.actions)
      .set({
        submittedText: p.data.text,
        draftText: p.data.text,
        submittedAt: new Date().toISOString(),
      })
      .where(eq(schema.actions.id, p.data.actionId))
      .run();
    return NextResponse.json({ ok: true });
  }

  if (body.op === "skip") {
    const p = Skip.safeParse(body);
    if (!p.success) return NextResponse.json({ error: "bad body" }, { status: 400 });
    const seat = await db
      .select()
      .from(schema.seats)
      .where(
        and(
          eq(schema.seats.worldId, p.data.worldId),
          eq(schema.seats.roleId, p.data.roleId),
          eq(schema.seats.playerId, player.id),
        ),
      )
      .get();
    if (!seat) return new NextResponse("Not seated in that role.", { status: 403 });

    const now = new Date().toISOString();
    let actionId = p.data.actionId;
    if (actionId) {
      const existing = await db
        .select()
        .from(schema.actions)
        .where(eq(schema.actions.id, actionId))
        .get();
      if (!existing) return new NextResponse("Action not found.", { status: 404 });
      if (existing.authorPlayerId !== player.id)
        return new NextResponse("Not your action.", { status: 403 });
      if (existing.submittedAt) return NextResponse.json({ ok: true });
      await db
        .update(schema.actions)
        .set({ submittedText: "", draftText: "", submittedAt: now })
        .where(eq(schema.actions.id, actionId))
        .run();
    } else {
      actionId = newId();
      await db
        .insert(schema.actions)
        .values({
          id: actionId,
          turnId: p.data.turnId,
          roleId: p.data.roleId,
          authorPlayerId: player.id,
          slot: 1,
          draftText: "",
          submittedText: "",
          submittedAt: now,
        })
        .run();
    }
    return NextResponse.json({ ok: true, actionId });
  }

  if (body.op === "resolve") {
    const p = Resolve.safeParse(body);
    if (!p.success) return NextResponse.json({ error: "bad body" }, { status: 400 });
    const action = await db
      .select()
      .from(schema.actions)
      .where(eq(schema.actions.id, p.data.actionId))
      .get();
    if (!action) return new NextResponse("Action not found.", { status: 404 });
    // Resolve is final: once resolvedAt is set, no further edits.
    if (action.resolvedAt)
      return new NextResponse("Already resolved.", { status: 409 });
    const turn = await db
      .select()
      .from(schema.turns)
      .where(eq(schema.turns.id, action.turnId))
      .get();
    if (!turn) return new NextResponse("Turn not found.", { status: 404 });
    const world = await db
      .select()
      .from(schema.worlds)
      .where(eq(schema.worlds.id, turn.worldId))
      .get();
    if (!world) return new NextResponse("World not found.", { status: 404 });
    if (world.realityPlayerId !== player.id)
      return new NextResponse("Only Reality can resolve.", { status: 403 });
    await db
      .update(schema.actions)
      .set({
        resolvedText: p.data.resolvedText,
        resolvedOutcome: p.data.resolvedOutcome ?? null,
        resolvedAt: new Date().toISOString(),
      })
      .where(eq(schema.actions.id, p.data.actionId))
      .run();
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "unknown op" }, { status: 400 });
}
