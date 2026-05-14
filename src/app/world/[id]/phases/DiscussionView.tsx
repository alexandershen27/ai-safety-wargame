"use client";
// Discussion phase. Each seated player drafts an action per role they hold.
//
// Other players' submitted actions are hidden until I submit at least one of
// my own — that gate is enforced by the server (state.ts), so even peeking at
// the polling JSON can't reveal them. Once I submit, I see all submissions.
import { useEffect, useState } from "react";
import { RoleChip } from "@/components/RoleChip";
import type { WorldView } from "@/lib/world/state";

export function DiscussionView({
  worldId,
  view,
  you,
}: {
  worldId: string;
  view: WorldView;
  you: { id: string; displayName: string };
}) {
  const turn = view.currentTurn!;
  const myRoles = view.roles.filter((r) => view.myRoleIds.includes(r.id));
  const submitted = view.actions.filter((a) => a.submittedAt);

  return (
    <div
      style={{
        maxWidth: 880,
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        gap: 24,
      }}
    >
      {myRoles.length === 0 && (
        <div className="gb-card">
          <p className="gb-p">
            You're spectating. Sit down at a role from the lobby to draft actions.
          </p>
        </div>
      )}

      {myRoles.map((role) => {
        const myAction = view.actions.find(
          (a) => a.roleId === role.id && a.authorPlayerId === you.id,
        );
        return (
          <ActionDraft
            key={role.id}
            worldId={worldId}
            turnId={turn.id}
            role={role}
            existing={myAction}
          />
        );
      })}

      <div>
        <div className="gb-h" style={{ marginBottom: 8 }}>
          <span className="ttl">Submitted actions</span>
          <span className="meta">
            {view.actionsHidden
              ? "submit one of your own to see others'"
              : `${submitted.length} so far`}
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {submitted.length === 0 && !view.actionsHidden && (
            <p className="gb-p" style={{ color: "var(--muted)" }}>
              No actions submitted yet.
            </p>
          )}
          {view.actionsHidden && (
            <p className="gb-p" style={{ color: "var(--muted)" }}>
              Other players' actions appear here after you submit yours.
            </p>
          )}
          {submitted.map((a) => {
            const role = view.roles.find((r) => r.id === a.roleId)!;
            return (
              <div key={a.id} className="gb-card">
                <div
                  style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}
                >
                  <RoleChip role={role} />
                  <span className="gb-mono" style={{ color: "var(--muted)", fontSize: 10 }}>
                    submitted
                  </span>
                </div>
                <p className="gb-p">{a.submittedText}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ActionDraft({
  worldId,
  turnId,
  role,
  existing,
}: {
  worldId: string;
  turnId: string;
  role: { id: string; name: string; color: string };
  existing?: {
    id: string;
    draftText: string;
    submittedText: string | null;
    submittedAt: string | null;
  };
}) {
  const [text, setText] = useState(existing?.draftText ?? "");
  const [actionId, setActionId] = useState<string | undefined>(existing?.id);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Optimistic: flip to "submitted" instantly on click, even before the next poll.
  const [optimisticSubmitted, setOptimisticSubmitted] = useState(false);
  const submitted = !!existing?.submittedAt || optimisticSubmitted;

  useEffect(() => {
    if (existing && existing.id !== actionId) {
      setActionId(existing.id);
      setText(existing.draftText);
    }
  }, [existing, actionId]);

  // Debounced auto-save of drafts (only while not submitted).
  useEffect(() => {
    if (submitted) return;
    const t = setTimeout(async () => {
      const res = await fetch("/api/actions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          op: "draft",
          worldId,
          turnId,
          roleId: role.id,
          draftText: text,
          actionId,
        }),
      });
      if (res.ok) {
        const { actionId: id } = (await res.json()) as { actionId: string };
        setActionId(id);
        setSavedAt(Date.now());
      }
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  async function submit() {
    if (!text.trim()) return;
    setSubmitting(true);
    setOptimisticSubmitted(true);
    let id = actionId;
    if (!id) {
      const r = await fetch("/api/actions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          op: "draft",
          worldId,
          turnId,
          roleId: role.id,
          draftText: text,
        }),
      });
      const j = (await r.json()) as { actionId: string };
      id = j.actionId;
      setActionId(id);
    }
    const r = await fetch("/api/actions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "submit", actionId: id, text }),
    });
    if (!r.ok) {
      // Revert optimistic lock on failure.
      setOptimisticSubmitted(false);
    }
    setSubmitting(false);
  }

  return (
    <div className="gb-card">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <RoleChip role={role} />
        <span className="gb-mono" style={{ color: "var(--muted)", fontSize: 10 }}>
          {submitted ? "submitted · locked" : savedAt ? "saved" : "drafting"}
        </span>
      </div>
      <textarea
        className="gb-textarea"
        placeholder="Phrase your action as a fact: 'We do X because Y.'"
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={submitted}
      />
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
        <button
          className="gb-btn primary sm"
          onClick={submit}
          disabled={submitting || submitted || !text.trim()}
        >
          {submitted ? "Submitted" : submitting ? "Submitting…" : "Submit action"}
        </button>
      </div>
    </div>
  );
}
