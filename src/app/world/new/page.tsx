// Reality: create a world. Form posts to /api/worlds.
//
// Auth gate: Reality MUST be signed in. Anonymous cookie-only visitors get
// bounced to /sign-in with this page as the post-verify `next` target. The
// API handler enforces the same check defensively.
import { redirect } from "next/navigation";
import { Topbar } from "@/components/Topbar";
import { ensurePlayer } from "@/lib/auth";
import { getAccountForPlayer } from "@/lib/auth-account";
import { CreateWorldForm } from "./CreateWorldForm";

export default async function NewWorldPage() {
  const player = await ensurePlayer();
  const account = await getAccountForPlayer(player);
  if (!account) {
    redirect("/sign-in?next=" + encodeURIComponent("/world/new"));
  }
  return (
    <>
      <Topbar
        worldName="New world"
        you={player.displayName}
        account={{ email: account.email }}
      />
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
