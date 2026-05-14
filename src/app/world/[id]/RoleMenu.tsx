"use client";
// "Manage roles" menu — lets a player join additional roles, leave roles they
// hold, or (for spectators) take a seat mid-game. Tucked behind a dropdown
// in the shellbar so the option exists but isn't loud. Same /api/seats
// endpoint as the lobby; no Reality approval gate in v1.
//
// Effects on game state:
//   - Joining a role mid-turn: you become an authorized author for that role's
//     action. Existing co-seat drafts are unaffected; you can start your own.
//   - Leaving the LAST role you hold turns you into a spectator (no seats).
//     We don't try to clean up drafts you already wrote — they remain in the
//     DB but you can no longer edit them (seat check on the draft API blocks).
import { useState } from "react";
import { requestRefresh } from "@/lib/refresh";

type Role = { id: string; name: string; color: string };

export function RoleMenu({
  worldId,
  roles,
  myRoleIds,
  seatCountsByRole,
}: {
  worldId: string;
  roles: Role[];
  myRoleIds: string[];
  seatCountsByRole: Record<string, number>;
}) {
  const [open, setOpen] = useState(false);
  const [busyRoleId, setBusyRoleId] = useState<string | null>(null);

  const mineSet = new Set(myRoleIds);

  async function toggle(roleId: string, currentlyMine: boolean) {
    setBusyRoleId(roleId);
    const method = currentlyMine ? "DELETE" : "POST";
    const res = await fetch("/api/seats", {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ worldId, roleId }),
    });
    if (res.ok) requestRefresh();
    setBusyRoleId(null);
  }

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        className="gb-btn sm"
        onClick={() => setOpen((v) => !v)}
        title="Join or leave roles."
        aria-expanded={open}
      >
        ⋯ Roles ({myRoleIds.length})
      </button>
      {open && (
        <>
          {/* Click-outside backdrop. */}
          <div
            onClick={() => setOpen(false)}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 10,
            }}
          />
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 6px)",
              right: 0,
              minWidth: 260,
              background: "var(--panel)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              padding: 8,
              zIndex: 11,
              display: "flex",
              flexDirection: "column",
              gap: 4,
              boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
            }}
          >
            <div
              className="gb-mono"
              style={{
                color: "var(--muted)",
                fontSize: 10,
                padding: "4px 6px 6px",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              Manage your seats
            </div>
            {roles.map((r) => {
              const mine = mineSet.has(r.id);
              const others = (seatCountsByRole[r.id] ?? 0) - (mine ? 1 : 0);
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => toggle(r.id, mine)}
                  disabled={busyRoleId === r.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 6px",
                    background: "transparent",
                    border: 0,
                    borderRadius: 4,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    fontSize: 12,
                    color: "var(--text)",
                    textAlign: "left",
                  }}
                  className="gb-rolemenu-row"
                >
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: r.color,
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ flex: 1 }}>{r.name}</span>
                  <span
                    className="gb-mono"
                    style={{ color: "var(--muted)", fontSize: 10 }}
                  >
                    {others > 0 ? `+${others}` : ""}
                  </span>
                  <span
                    className="gb-mono"
                    style={{
                      fontSize: 10,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      color: mine ? "var(--bad)" : "var(--accent)",
                    }}
                  >
                    {busyRoleId === r.id ? "…" : mine ? "Leave" : "Join"}
                  </span>
                </button>
              );
            })}
            {myRoleIds.length === 0 && (
              <div
                className="gb-mono"
                style={{
                  color: "var(--muted)",
                  fontSize: 10,
                  padding: "6px",
                }}
              >
                You're a spectator. Join any role to play.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
