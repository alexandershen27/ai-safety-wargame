// Player join: type code + display name → land in lobby.
import { Topbar } from "@/components/Topbar";
import { ensurePlayer } from "@/lib/auth";
import { getAccountForPlayer } from "@/lib/auth-account";
import { JoinForm } from "./JoinForm";

export default async function JoinPage() {
  const player = await ensurePlayer();
  const account = await getAccountForPlayer(player);
  return (
    <>
      <Topbar
        worldName=""
        you={player.displayName}
        account={account ? { email: account.email } : null}
      />
      <main style={{ padding: 32, maxWidth: 480, margin: "0 auto", width: "100%" }}>
        <h1 className="gb-h2" style={{ marginBottom: 4 }}>Join a world</h1>
        <p className="gb-p" style={{ marginBottom: 24, color: "var(--muted)" }}>
          Enter the code you got from Reality.
        </p>
        <JoinForm defaultName={player.displayName} />
      </main>
    </>
  );
}
