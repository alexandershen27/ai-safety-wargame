"use client";
// Lobby client: seat picker + Reality Start button.
//
// Multi-seat is allowed: taking a seat does NOT release others you hold.
// Use the "Leave" button on a specific seat to drop just that one.
// Optimistic state on click — local roles list updates immediately, then
// reconciles when the next refresh comes in.
import { useEffect, useRef, useState, useTransition } from "react";
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
  currentPlayerName,
  roles: initialRoles,
}: {
  worldId: string;
  isReality: boolean;
  currentPlayerId: string;
  currentPlayerName: string;
  roles: RoleRow[];
}) {
  const router = useRouter();
  const [roles, setRoles] = useState(initialRoles);
  const [, startTransition] = useTransition();
  const [busyRoleId, setBusyRoleId] = useState<string | null>(null);
  // Timestamp of the most recent local mutation. The "accept the new server
  // snapshot" effect below ignores any router.refresh() result whose payload
  // was minted BEFORE the user clicked — that's how the take/leave flicker
  // happens: a stale snapshot arrives mid-POST and overwrites the optimistic
  // state. We approximate "was minted before the click" by tracking that the
  // last server snapshot we accepted is what we're still showing — if local
  // diverged (optimistic), we wait for a snapshot that actually moved past it.
  const lastServerRolesRef = useRef(initialRoles);
  const lastMutationAtRef = useRef(0);

  // 2s poll for lobby updates. Server-render gives us fresh occupants on each tick.
  useEffect(() => {
    const t = setInterval(() => {
      startTransition(() => router.refresh());
    }, 2000);
    return () => clearInterval(t);
  }, [router]);

  // Reconcile when the server snapshot changes. We only adopt the new server
  // state if either (a) local matches what the server last told us (no
  // optimistic divergence to preserve), OR (b) it's been >800ms since the
  // last mutation — long enough that the POST should have flushed and the
  // incoming snapshot likely reflects it.
  useEffect(() => {
    const localMatchesLastServer =
      JSON.stringify(roles) === JSON.stringify(lastServerRolesRef.current);
    const enoughTimePassed =
      Date.now() - lastMutationAtRef.current > 800;
    if (localMatchesLastServer || enoughTimePassed) {
      setRoles(initialRoles);
    }
    lastServerRolesRef.current = initialRoles;
    // We intentionally exclude `roles` from deps — including it would
    // re-fire on every optimistic setRoles and immediately compare against
    // itself, defeating the purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialRoles]);

  async function take(roleId: string) {
    setBusyRoleId(roleId);
    lastMutationAtRef.current = Date.now();
    // Optimistic: add self to the occupant list locally.
    setRoles((rs) =>
      rs.map((r) =>
        r.id === roleId && !r.occupants.some((o) => o.id === currentPlayerId)
          ? { ...r, occupants: [...r.occupants, { id: currentPlayerId, displayName: currentPlayerName }] }
          : r,
      ),
    );
    const res = await fetch("/api/seats", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ worldId, roleId }),
    });
    if (!res.ok) {
      // Revert on failure.
      setRoles((rs) =>
        rs.map((r) =>
          r.id === roleId
            ? { ...r, occupants: r.occupants.filter((o) => o.id !== currentPlayerId) }
            : r,
        ),
      );
    }
    router.refresh();
    setBusyRoleId(null);
  }

  async function leave(roleId: string) {
    setBusyRoleId(roleId);
    lastMutationAtRef.current = Date.now();
    // Optimistic remove.
    setRoles((rs) =>
      rs.map((r) =>
        r.id === roleId
          ? { ...r, occupants: r.occupants.filter((o) => o.id !== currentPlayerId) }
          : r,
      ),
    );
    const res = await fetch("/api/seats", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ worldId, roleId }),
    });
    if (!res.ok) {
      setRoles((rs) =>
        rs.map((r) =>
          r.id === roleId && !r.occupants.some((o) => o.id === currentPlayerId)
            ? { ...r, occupants: [...r.occupants, { id: currentPlayerId, displayName: currentPlayerName }] }
            : r,
        ),
      );
    }
    router.refresh();
    setBusyRoleId(null);
  }

  async function start() {
    setBusyRoleId("__start__");
    const res = await fetch(`/api/worlds/${worldId}/start`, { method: "POST" });
    if (res.ok) router.push(`/world/${worldId}`);
    else setBusyRoleId(null);
  }

  const seatCount = roles.reduce(
    (acc, r) => acc + (r.occupants.some((o) => o.id === currentPlayerId) ? 1 : 0),
    0,
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="gb-h">
        <span className="ttl">Roles</span>
        <span className="meta">
          {seatCount === 0
            ? "Pick one or more roles, or stay as a spectator."
            : `You hold ${seatCount} seat${seatCount === 1 ? "" : "s"}. You can take more or leave any.`}
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {roles.map((r) => {
          const mine = r.occupants.some((o) => o.id === currentPlayerId);
          return (
            <div
              key={r.id}
              className="gb-card"
              style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}
            >
              <RoleChip role={r} />
              <div style={{ flex: 1, display: "flex", gap: 6, flexWrap: "wrap", minWidth: 120 }}>
                {r.occupants.length === 0 ? (
                  <span className="gb-mute" style={{ fontSize: 11 }}>
                    empty
                  </span>
                ) : (
                  r.occupants.map((o) => (
                    <span
                      key={o.id}
                      className={"gb-pill" + (o.id === currentPlayerId ? " accent" : "")}
                    >
                      {o.displayName}
                      {o.id === currentPlayerId ? " · you" : ""}
                    </span>
                  ))
                )}
              </div>
              <button
                className={"gb-btn sm" + (mine ? "" : " primary")}
                onClick={() => (mine ? leave(r.id) : take(r.id))}
                disabled={busyRoleId === r.id}
              >
                {mine ? "Leave" : "Take seat"}
              </button>
            </div>
          );
        })}
      </div>

      {isReality && (
        <div style={{ display: "flex", gap: 10, marginTop: 12, alignItems: "center", flexWrap: "wrap" }}>
          <button
            className="gb-btn primary"
            onClick={start}
            disabled={busyRoleId === "__start__"}
          >
            Start world →
          </button>
          <span className="gb-mute" style={{ fontSize: 11 }}>
            Once started, players land in Turn 1 / Discussion.
          </span>
        </div>
      )}
    </div>
  );
}
