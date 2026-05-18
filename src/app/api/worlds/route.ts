// Create a world. Reality auto-becomes the world's reality_player_id.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, schema, ensureSchema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { newId, newJoinCode } from "@/lib/ids";
import { setDisplayName } from "@/lib/auth";
import { getAccountForPlayer } from "@/lib/auth-account";

const Body = z.object({
  worldName: z.string().min(1).max(80),
  displayName: z.string().min(1).max(40),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timestepUnit: z.enum(["day", "week", "month", "year"]),
  timestepAmount: z.number().int().min(1).max(1000),
  roles: z
    .array(
      z.object({
        name: z.string().min(1).max(60),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      }),
    )
    .min(1)
    .max(20),
});

export async function POST(req: NextRequest) {
  await ensureSchema();
  const json = await req.json();
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const data = parsed.data;
  const reality = await setDisplayName(data.displayName);
  // Reality MUST be signed into an account. The /world/new page already
  // gates on this; the API check is defense in depth.
  const account = await getAccountForPlayer(reality);
  if (!account) {
    return new NextResponse("Sign in required to create a world.", {
      status: 401,
    });
  }

  let joinCode = newJoinCode();
  for (let i = 0; i < 5; i++) {
    const exists = await db
      .select()
      .from(schema.worlds)
      .where(eq(schema.worlds.joinCode, joinCode))
      .get();
    if (!exists) break;
    joinCode = newJoinCode();
  }

  const worldId = newId();
  await db
    .insert(schema.worlds)
    .values({
      id: worldId,
      name: data.worldName,
      joinCode,
      realityPlayerId: reality.id,
      realityAccountId: account.id,
      startDate: data.startDate,
      currentDate: data.startDate,
      timestepUnit: data.timestepUnit,
      timestepAmount: data.timestepAmount,
      phaseDurations: JSON.stringify({
        discussion: null,
        vote: 300,
        resolve: null,
      }),
      worldState: "{}",
      status: "lobby",
    })
    .run();

  for (let i = 0; i < data.roles.length; i++) {
    const r = data.roles[i];
    await db
      .insert(schema.roles)
      .values({ id: newId(), worldId, name: r.name, color: r.color, position: i })
      .run();
  }

  return NextResponse.json({ worldId, joinCode });
}
