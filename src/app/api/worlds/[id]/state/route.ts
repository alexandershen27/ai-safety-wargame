import { NextRequest, NextResponse } from "next/server";
import { ensurePlayer } from "@/lib/auth";
import { getWorldView } from "@/lib/world/state";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const player = await ensurePlayer();
  const view = await getWorldView(id, player.id);
  if (!view) return new NextResponse("Not found.", { status: 404 });
  return NextResponse.json(view);
}
