import { notFound } from "next/navigation";
import Link from "next/link";
import { ensurePlayer } from "@/lib/auth";
import { db, schema, ensureSchema } from "@/lib/db";
import { eq, asc, inArray } from "drizzle-orm";
import { Topbar } from "@/components/Topbar";
import { RoleChip } from "@/components/RoleChip";
import { formatDate } from "@/lib/timestep";

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
  const roleById = new Map(roles.map((r) => [r.id, r]));

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

  return (
    <>
      <Topbar worldName={world.name} you={player.displayName} />
      <div
        style={{
          padding: "8px 16px",
          background: "var(--bg-2)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <Link
          href={`/world/${id}`}
          className="gb-mono"
          style={{ color: "var(--muted)" }}
        >
          ← Back to world
        </Link>
      </div>
      <main style={{ padding: 24, maxWidth: 880, margin: "0 auto", width: "100%" }}>
        <h1 className="gb-h2" style={{ marginBottom: 16 }}>
          History
        </h1>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {turns.map((t) => {
            const turnActions = actions.filter((a) => a.turnId === t.id);
            return (
              <div key={t.id} className="gb-card">
                <div className="gb-h" style={{ marginBottom: 8 }}>
                  <span className="ttl">
                    Turn {String(t.turnNumber).padStart(2, "0")} · {t.phase}
                  </span>
                  <span className="meta">{formatDate(t.dateAtTurn)}</span>
                </div>
                {turnActions.length === 0 ? (
                  <p className="gb-p" style={{ color: "var(--muted)" }}>
                    No actions.
                  </p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {turnActions.map((a) => {
                      const role = roleById.get(a.roleId);
                      const text = a.resolvedText ?? a.submittedText ?? a.draftText;
                      const status = a.resolvedText
                        ? "resolved"
                        : a.submittedText
                          ? "submitted"
                          : "draft";
                      return (
                        <div
                          key={a.id}
                          style={{ borderLeft: "2px solid var(--border)", paddingLeft: 10 }}
                        >
                          <div
                            style={{
                              display: "flex",
                              gap: 8,
                              alignItems: "center",
                              marginBottom: 4,
                            }}
                          >
                            {role && <RoleChip role={role} />}
                            <span
                              className="gb-mono"
                              style={{ color: "var(--muted)", fontSize: 10 }}
                            >
                              {status}
                              {a.resolvedOutcome ? ` · ${a.resolvedOutcome}` : ""}
                            </span>
                          </div>
                          <p className="gb-p">{text || "(empty)"}</p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </main>
    </>
  );
}
