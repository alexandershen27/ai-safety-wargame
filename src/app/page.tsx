// Landing page — two doors: Create a world (Reality), Join with a code (Player).
import Link from "next/link";
import { Topbar } from "@/components/Topbar";
import { ensurePlayer } from "@/lib/auth";

export default async function Home() {
  const player = await ensurePlayer();
  return (
    <>
      <Topbar worldName="" you={player.displayName} />
      <main
        className="flex-1 flex items-center justify-center"
        style={{ padding: 32 }}
      >
        <div style={{ maxWidth: 520, width: "100%" }}>
          <h1 className="gb-h2" style={{ marginBottom: 4 }}>
            Scenario sandbox
          </h1>
          <p className="gb-p" style={{ marginBottom: 24, color: "var(--muted)" }}>
            Create a world, invite players with a code, run a structured deliberation.
          </p>

          <div className="gb-grid-2" style={{ gap: 16 }}>
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
        </div>
      </main>
    </>
  );
}
