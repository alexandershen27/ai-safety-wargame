// Timeline / branch graph page. Server-renders all data once; client component
// handles selection state and the branch / switch buttons.
import { notFound } from "next/navigation";
import Link from "next/link";
import { ensurePlayer } from "@/lib/auth";
import { getAccountForPlayer } from "@/lib/auth-account";
import { db, schema, ensureSchema } from "@/lib/db";
import { eq, asc, inArray } from "drizzle-orm";
import { Topbar } from "@/components/Topbar";
import { BranchGraphClient } from "./BranchGraphClient";
import type { TimestepUnit } from "@/lib/timestep";

export const dynamic = "force-dynamic";

export default async function TimelinePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await ensureSchema();
  const { id } = await params;
  const player = await ensurePlayer();
  const world = await db
    .select()
    .from(schema.worlds)
    .where(eq(schema.worlds.id, id))
    .get();
  if (!world) notFound();

  const roles = await db
    .select()
    .from(schema.roles)
    .where(eq(schema.roles.worldId, id))
    .all();

  const turns = await db
    .select()
    .from(schema.turns)
    .where(eq(schema.turns.worldId, id))
    .orderBy(asc(schema.turns.turnNumber))
    .all();
  const turnIds = turns.map((t) => t.id);
  const actions = turnIds.length
    ? await db
        .select()
        .from(schema.actions)
        .where(inArray(schema.actions.turnId, turnIds))
        .all()
    : [];

  const account = await getAccountForPlayer(player);
  const isReality =
    !!account &&
    !!world.realityAccountId &&
    world.realityAccountId === account.id;

  return (
    <>
      <Topbar
        worldName={world.name}
        you={player.displayName}
        account={account ? { email: account.email } : null}
      />
      <div className="gb-shellbar">
        <Link
          href={`/world/${id}`}
          className="gb-mono"
          style={{ color: "var(--muted)" }}
        >
          ← Back to world
        </Link>
        <span className="gb-mono" style={{ color: "var(--muted)", fontSize: 11 }}>
          {turns.length} turn{turns.length === 1 ? "" : "s"} · {roles.length} role
          {roles.length === 1 ? "" : "s"}
        </span>
      </div>
      <main style={{ padding: 24, maxWidth: 1200, margin: "0 auto", width: "100%" }}>
        <h1 className="gb-h2" style={{ marginBottom: 4 }}>
          History
        </h1>
        <p
          className="gb-p"
          style={{ color: "var(--muted)", marginBottom: 20, fontSize: 12 }}
        >
          {isReality
            ? "Click any turn to inspect. Use “Resolve Differently” to fork a parallel resolution on any closed turn, or “Switch here” to jump to the tip of an inactive branch."
            : "Click any turn to inspect its actions and resolutions."}
        </p>
        <BranchGraphClient
          worldId={id}
          isReality={isReality}
          currentTurnId={world.currentTurnId ?? null}
          turns={turns.map((t) => ({
            id: t.id,
            turnNumber: t.turnNumber,
            dateAtTurn: t.dateAtTurn,
            phase: t.phase,
            closedAt: t.closedAt,
            parentTurnId: t.parentTurnId,
            createdAt: t.createdAt,
          }))}
          roles={roles.map((r) => ({ id: r.id, name: r.name, color: r.color }))}
          actions={actions.map((a) => ({
            id: a.id,
            turnId: a.turnId,
            roleId: a.roleId,
            submittedAt: a.submittedAt,
            submittedText: a.submittedText,
            resolvedText: a.resolvedText,
            resolvedOutcome: a.resolvedOutcome,
          }))}
          unit={world.timestepUnit as TimestepUnit}
        />
      </main>
    </>
  );
}
