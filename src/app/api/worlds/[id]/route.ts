// DELETE a world. Reality only. Cascades through turns/roles/seats/actions/votes
// via the FK ON DELETE CASCADE declarations in the schema.
import { NextRequest, NextResponse } from "next/server";
import { db, schema, ensureSchema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { ensurePlayer } from "@/lib/auth";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  await ensureSchema();
  const { id } = await params;
  const player = await ensurePlayer();
  const world = await db
    .select()
    .from(schema.worlds)
    .where(eq(schema.worlds.id, id))
    .get();
  if (!world) return new NextResponse("World not found.", { status: 404 });
  if (world.realityPlayerId !== player.id)
    return new NextResponse("Only Reality can delete a world.", { status: 403 });
  await db.delete(schema.worlds).where(eq(schema.worlds.id, id)).run();
  return NextResponse.json({ ok: true });
}
