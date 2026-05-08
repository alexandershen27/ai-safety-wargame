// Reality: create a world. Form posts to /api/worlds.
import { Topbar } from "@/components/Topbar";
import { ensurePlayer } from "@/lib/auth";
import { CreateWorldForm } from "./CreateWorldForm";

export default async function NewWorldPage() {
  const player = await ensurePlayer();
  return (
    <>
      <Topbar worldName="New world" you={player.displayName} />
      <main style={{ padding: 32, maxWidth: 720, margin: "0 auto", width: "100%" }}>
        <h1 className="gb-h2" style={{ marginBottom: 4 }}>
          Create a world
        </h1>
        <p className="gb-p" style={{ marginBottom: 24, color: "var(--muted)" }}>
          You'll be Reality. Players join with a code you'll get on the next screen.
        </p>
        <CreateWorldForm defaultName={player.displayName} />
      </main>
    </>
  );
}
