import { redirect, notFound } from "next/navigation";
import { Topbar } from "@/components/Topbar";
import { CopyCode } from "@/components/CopyCode";
import { ensurePlayer } from "@/lib/auth";
import { loadWorld, loadPlayersForSeats, seatsByRole } from "@/lib/world/load";
import { LobbyClient } from "./LobbyClient";

export const dynamic = "force-dynamic";

export default async function LobbyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const player = await ensurePlayer();
  const data = await loadWorld(id);
  if (!data) notFound();
  if (data.world.status === "active") redirect(`/world/${id}`);

  const playerIds = Array.from(new Set(data.seats.map((s) => s.playerId)));
  const players = await loadPlayersForSeats(playerIds);
  const seatedByRole = seatsByRole(data.seats, players);
  const isReality = data.world.realityPlayerId === player.id;

  return (
    <>
      <Topbar worldName={data.world.name} you={player.displayName} />
      <main style={{ padding: 32, maxWidth: 880, margin: "0 auto", width: "100%" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginBottom: 16,
          }}
        >
          <div>
            <h1 className="gb-h2" style={{ marginBottom: 4 }}>
              {data.world.name}
            </h1>
            <p className="gb-p" style={{ color: "var(--muted)" }}>
              {data.world.timestepAmount} {data.world.timestepUnit}/turn · starts{" "}
              {data.world.startDate}
            </p>
          </div>
          <div
            className="gb-card tight"
            style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}
          >
            <span
              className="gb-mono"
              style={{
                color: "var(--muted)",
                fontSize: 10,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              Join code
            </span>
            <CopyCode code={data.world.joinCode} />
          </div>
        </div>

        <LobbyClient
          worldId={data.world.id}
          isReality={isReality}
          currentPlayerId={player.id}
          currentPlayerName={player.displayName}
          roles={data.roles.map((r) => ({
            id: r.id,
            name: r.name,
            color: r.color,
            occupants: (seatedByRole.get(r.id) ?? []).map((p) => ({
              id: p.id,
              displayName: p.displayName,
            })),
          }))}
        />
      </main>
    </>
  );
}
