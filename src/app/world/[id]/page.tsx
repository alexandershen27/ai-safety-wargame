import { redirect, notFound } from "next/navigation";
import { ensurePlayer } from "@/lib/auth";
import { getWorldView } from "@/lib/world/state";
import { WorldShell } from "./WorldShell";

export const dynamic = "force-dynamic";

export default async function WorldPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const player = await ensurePlayer();
  const initial = await getWorldView(id, player.id);
  if (!initial) notFound();
  if (initial.world.status === "lobby") redirect(`/world/${id}/lobby`);
  return (
    <WorldShell
      worldId={id}
      you={{ id: player.id, displayName: player.displayName }}
      initial={initial}
    />
  );
}
