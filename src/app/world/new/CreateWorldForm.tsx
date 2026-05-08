"use client";
// Client form for world creation. Roles are an editable list; one row per role.
// Color defaults rotate through a small palette so Reality doesn't have to think.
import { useState } from "react";
import { useRouter } from "next/navigation";

const ROLE_PALETTE = [
  "#d28a4a", "#4f8fce", "#c75858", "#6bb0a0",
  "#9b8fc7", "#d8b46a", "#a4a08c", "#b85f8f",
];

type RoleDraft = { name: string; color: string };

export function CreateWorldForm({ defaultName }: { defaultName: string }) {
  const router = useRouter();
  const [worldName, setWorldName] = useState("Untitled World");
  const [displayName, setDisplayName] = useState(defaultName);
  const today = new Date().toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(today);
  const [timestepUnit, setTimestepUnit] =
    useState<"day" | "week" | "month" | "year">("month");
  const [timestepAmount, setTimestepAmount] = useState(1);
  const [roles, setRoles] = useState<RoleDraft[]>([
    { name: "USG", color: ROLE_PALETTE[1] },
    { name: "Frontier Cos.", color: ROLE_PALETTE[0] },
    { name: "CCP", color: ROLE_PALETTE[2] },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateRole(i: number, patch: Partial<RoleDraft>) {
    setRoles((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function addRole() {
    setRoles((rs) => [
      ...rs,
      { name: "", color: ROLE_PALETTE[rs.length % ROLE_PALETTE.length] },
    ]);
  }
  function removeRole(i: number) {
    setRoles((rs) => rs.filter((_, idx) => idx !== i));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!worldName.trim()) return setError("World name required.");
    if (roles.length < 1) return setError("At least one role required.");
    if (roles.some((r) => !r.name.trim()))
      return setError("Every role needs a name.");
    setSubmitting(true);
    const res = await fetch("/api/worlds", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        worldName: worldName.trim(),
        displayName: displayName.trim() || "Reality",
        startDate,
        timestepUnit,
        timestepAmount,
        roles: roles.map((r) => ({ name: r.name.trim(), color: r.color })),
      }),
    });
    if (!res.ok) {
      setSubmitting(false);
      setError(await res.text());
      return;
    }
    const { worldId } = (await res.json()) as { worldId: string };
    router.push(`/world/${worldId}/lobby`);
  }

  return (
    <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <Field label="Your name (Reality)">
        <input
          className="gb-input"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
      </Field>

      <Field label="World name">
        <input
          className="gb-input"
          value={worldName}
          onChange={(e) => setWorldName(e.target.value)}
        />
      </Field>

      <div className="gb-grid-3">
        <Field label="Start date">
          <input
            className="gb-input"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </Field>
        <Field label="Step amount">
          <input
            className="gb-input"
            type="number"
            min={1}
            value={timestepAmount}
            onChange={(e) => setTimestepAmount(Math.max(1, +e.target.value || 1))}
          />
        </Field>
        <Field label="Step unit">
          <select
            className="gb-select"
            value={timestepUnit}
            onChange={(e) => setTimestepUnit(e.target.value as "day" | "week" | "month" | "year")}
          >
            <option value="day">days</option>
            <option value="week">weeks</option>
            <option value="month">months</option>
            <option value="year">years</option>
          </select>
        </Field>
      </div>

      <div>
        <div className="gb-h" style={{ marginBottom: 8 }}>
          <span className="ttl">Roles</span>
          <button type="button" className="gb-btn sm" onClick={addRole}>
            + Add role
          </button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {roles.map((r, i) => (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="color"
                value={r.color}
                onChange={(e) => updateRole(i, { color: e.target.value })}
                style={{ width: 36, height: 32, border: "1px solid var(--border)", borderRadius: 4, background: "transparent" }}
              />
              <input
                className="gb-input"
                placeholder="Role name (e.g. USG)"
                value={r.name}
                onChange={(e) => updateRole(i, { name: e.target.value })}
              />
              <button
                type="button"
                className="gb-btn sm danger"
                onClick={() => removeRole(i)}
                disabled={roles.length === 1}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>

      {error && (
        <div className="gb-card" style={{ borderColor: "var(--bad)", color: "var(--bad)" }}>
          {error}
        </div>
      )}

      <div style={{ display: "flex", gap: 10 }}>
        <button type="submit" className="gb-btn primary" disabled={submitting}>
          {submitting ? "Creating…" : "Create world"}
        </button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span className="gb-mono" style={{ color: "var(--muted)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em" }}>
        {label}
      </span>
      {children}
    </label>
  );
}
