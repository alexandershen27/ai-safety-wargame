// Sign-in page. Server component just renders the form; the real work is
// in SignInForm (client) which POSTs to /api/auth/magic-link.
import { Topbar } from "@/components/Topbar";
import { ensurePlayer } from "@/lib/auth";
import { getAccountForPlayer } from "@/lib/auth-account";
import { SignInForm } from "./SignInForm";

export const dynamic = "force-dynamic";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const player = await ensurePlayer();
  const account = await getAccountForPlayer(player);
  const { next, error } = await searchParams;

  return (
    <>
      <Topbar
        worldName=""
        you={player.displayName}
        account={account ? { email: account.email } : null}
      />
      <main
        className="flex-1 flex flex-col items-center"
        style={{ padding: 32 }}
      >
        <div style={{ maxWidth: 420, width: "100%" }}>
          <h1 className="gb-h2" style={{ marginBottom: 4 }}>
            Sign in
          </h1>
          <p
            className="gb-p"
            style={{ color: "var(--muted)", marginBottom: 20, fontSize: 12 }}
          >
            Reality needs an account to create worlds. Players can join with a
            code without one. We email you a sign-in link — no password.
          </p>
          {error && (
            <div
              className="gb-card"
              style={{
                borderColor: "var(--bad)",
                color: "var(--bad)",
                marginBottom: 16,
                fontSize: 13,
              }}
            >
              {error === "bad-link"
                ? "That link is expired or already used. Request a new one below."
                : error === "no-cookie"
                  ? "Your session expired. Try again."
                  : `Error: ${error}`}
            </div>
          )}
          <SignInForm next={typeof next === "string" ? next : "/"} />
        </div>
      </main>
    </>
  );
}
