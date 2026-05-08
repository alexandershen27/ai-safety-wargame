import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, schema, ensureSchema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { setDisplayName } from "@/lib/auth";

const Body = z.object({
  code: z.string().length(6),
  displayName: z.string().min(1).max(40),
});

export async function POST(req: NextRequest) {
  await ensureSchema();
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success)
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  const { code, displayName } = parsed.data;
  const world = await db
    .select()
    .from(schema.worlds)
    .where(eq(schema.worlds.joinCode, code))
    .get();
  if (!world)
    return new NextResponse("No world with that code.", { status: 404 });
  await setDisplayName(displayName);
  return NextResponse.json({ worldId: world.id });
}
