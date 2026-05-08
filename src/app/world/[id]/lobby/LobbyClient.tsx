"use client";
// Lobby client: seat picker + Reality Start button. Polls every 2s for new joins.
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RoleChip } from "@/components/RoleChip";

type RoleRow = {
  id: string;
  name: string;
  color: string;
  occupants: { id: string; displayName: string }[];
};

export function LobbyClient({
  worldId,
  isReality,
  currentPlayerId,
  roles: initialRoles,
}: {
  worldId: string;
  isReality: boolean;
  currentPlayerId: string;
  roles: RoleRow[];
}) {
  const router = useRouter();
  const [roles, setRoles] = useState(initialRoles);
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  // 2s poll for lobby updates. Cheap: hits a server action that refreshes data.
  useEffect(() => {
    const t = setInterval(() => {
      startTransition(() => router.refresh());
    }, 2000);
    return () => clearInterval(t);
  }, [router]);

  // When `initialRoles` changes (router.refresh re-renders the server component), sync state.
  useEffect(() => setRoles(initialRoles), [initialRoles]);

  const mySeatedRoleId = roles.find((r) =>
    r.occupants.some((o) => o.id === currentPlayerId),
  )?.id;

  async function take(roleId: string) {
    setBusy(true);
    if (mySeatedRoleId && mySeatedRoleId !== roleId) {
      await fetch("/api/seats", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ worldId, roleId: mySeatedRoleId }),
      });
    }
    await fetch("/api/seats", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ worldId, roleId }),
    });
    router.refresh();
    setBusy(false);
  }

  async function leave() {
    if (!mySeatedRoleId) return;
    setBusy(true);
    await fetch("/api/seats", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ worldId, roleId: mySeatedRoleId }),
    });
    router.refresh();
    setBusy(false);
  }

  async function start() {
    setBusy(true);
    const res = await fetch(`/api/worlds/${worldId}/start`, { method: "POST" });
    if (res.ok) router.push(`/world/${worldId}`);
    else setBusy(false);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="gb-h">
        <span className="ttl">Roles</span>
        <span className="meta">
          {mySeatedRoleId ? "You're seated. Click another role to switch, or spectate." : "Pick a role, or stay as a spectator."}
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {roles.map((r) => {
          const mine = mySeatedRoleId === r.id;
          return (
            <div key={r.id} className="gb-card" style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <RoleChip role={r} />
              <div style={{ flex: 1, display: "flex", gap: 6, flexWrap: "wrap" }}>
                {r.occupants.length === 0 ? (
                  <span className="gb-mute" style={{ fontSize: 11 }}>empty</span>
                ) : (
                  r.occupants.map((o) => (
                    <span key={o.id} className="gb-pill">
                      {o.displayName}
                      {o.id === currentPlayerId ? " · you" : ""}
                    </span>
                  ))
                )}
              </div>
              <button
                className={"gb-btn sm" + (mine ? " primary" : "")}
                onClick={() => (mine ? leave() : take(r.id))}
                disabled={busy}
              >
                {mine ? "Leave" : "Take seat"}
              </button>
            </div>
          );
        })}
      </div>

      {isReality && (
        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
          <button className="gb-btn primary" onClick={start} disabled={busy}>
            Start world →
          </button>
          <span className="gb-mute" style={{ fontSize: 11, alignSelf: "center" }}>
            Once started, players land in Turn 1 / Discussion.
          </span>
        </div>
      )}
    </div>
  );
}
