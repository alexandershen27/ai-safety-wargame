// Landing page — two doors (Create / Join) plus a list of worlds this player
// already has a relationship with, so they don't lose track on refresh.
import Link from "next/link";
import { Topbar } from "@/components/Topbar";
import { ensurePlayer } from "@/lib/auth";
import { getRecentWorldsForPlayer } from "@/lib/world/recent";

export const dynamic = "force-dynamic";

export default async function Home() {
  const player = await ensurePlayer();
  const recent = await getRecentWorldsForPlayer(player.id);

  return (
    <>
      <Topbar worldName="" you={player.displayName} />
      <main
        className="flex-1 flex flex-col items-center"
        style={{ padding: 32 }}
      >
        <div style={{ maxWidth: 640, width: "100%" }}>
          <h1 className="gb-h2" style={{ marginBottom: 4 }}>
            Scenario sandbox
          </h1>
          <p className="gb-p" style={{ marginBottom: 24, color: "var(--muted)" }}>
            Create a world, invite players with a code, run a structured
            deliberation.
          </p>

          <div className="gb-grid-2" style={{ gap: 16, marginBottom: 32 }}>
            <Link
              href="/world/new"
              className="gb-card"
              style={{ display: "block", textDecoration: "none" }}
            >
              <div className="gb-h" style={{ marginBottom: 8 }}>
                <span className="ttl">Reality</span>
              </div>
              <h2 className="gb-h3" style={{ marginBottom: 4 }}>
                Create a world →
              </h2>
              <p className="gb-p">
                Set up roles, start date, and timestep. Get a join code to share.
              </p>
            </Link>

            <Link
              href="/join"
              className="gb-card"
              style={{ display: "block", textDecoration: "none" }}
            >
              <div className="gb-h" style={{ marginBottom: 8 }}>
                <span className="ttl">Player</span>
              </div>
              <h2 className="gb-h3" style={{ marginBottom: 4 }}>
                Join with a code →
              </h2>
              <p className="gb-p">
                Type the code, take a seat at a role, or spectate.
              </p>
            </Link>
          </div>

          {recent.length > 0 && (
            <section>
              <div className="gb-h" style={{ marginBottom: 8 }}>
                <span className="ttl">Your worlds</span>
                <span className="meta">{recent.length}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {recent.map((w) => (
                  <Link
                    key={w.id}
                    href={w.status === "lobby" ? `/world/${w.id}/lobby` : `/world/${w.id}`}
                    className="gb-card"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      textDecoration: "none",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          marginBottom: 2,
                        }}
                      >
                        <span style={{ color: "var(--text)", fontSize: 14 }}>
                          {w.name}
                        </span>
                        {w.isReality && (
                          <span className="gb-pill accent">Reality</span>
                        )}
                        <span
                          className="gb-mono"
                          style={{ color: "var(--muted)", fontSize: 10 }}
                        >
                          {w.status}
                        </span>
                      </div>
                      <div
                        className="gb-mono"
                        style={{ color: "var(--muted)", fontSize: 11 }}
                      >
                        code {w.joinCode}
                      </div>
                    </div>
                    <span style={{ color: "var(--muted)" }}>→</span>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      </main>
    </>
  );
}
