"use client";
// DISCUSSION phase view. Combined drafting + voting:
//
//   - Above the fold: one ActionDraft per role you're seated at. Editable until
//     you submit; locked afterward.
//   - Below the fold: a VoteList of every action that's been submitted so far,
//     yours included. This only renders once you've personally submitted every
//     action you owe (the "strict gate"). Spectators see the gate forever.
//     Reality always sees it.
//
// Once your gate lifts, you can vote on actions as they come in. The server
// drives transitions: Reality's advance button skips VOTE entirely when
// everyone has naturally submitted.
import { useEffect, useState } from "react";
import { RoleChip } from "@/components/RoleChip";
import type { WorldView } from "@/lib/world/state";
import { VoteList } from "./VoteList";

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
  const canSeeOthers = !view.actionsHidden;

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
      {myRoles.length === 0 && !view.isReality && (
        <div className="gb-card">
          <p className="gb-p">
            You're spectating. Sit down at a role from the lobby to draft and
            vote on actions.
          </p>
        </div>
      )}

      {/* Your draft cards. */}
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

      {/* Vote section. Gate flips the moment you submit your last action. */}
      <div>
        <div className="gb-h" style={{ marginBottom: 8 }}>
          <span className="ttl">Submitted actions</span>
          <span className="meta">
            {canSeeOthers
              ? `${view.submitProgress.submitted} of ${view.submitProgress.expected} seats submitted`
              : myRoles.length === 0
                ? "spectators wait for resolution"
                : "submit all your actions to see and vote on others'"}
          </span>
        </div>
        {canSeeOthers ? (
          <VoteList
            view={view}
            you={you}
            emptyMessage="Waiting for the first action to be submitted."
          />
        ) : (
          <p className="gb-p" style={{ color: "var(--muted)" }}>
            Others' actions appear here as soon as you've submitted yours.
          </p>
        )}
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
  const [optimisticSubmitted, setOptimisticSubmitted] = useState(false);
  const submitted = !!existing?.submittedAt || optimisticSubmitted;

  useEffect(() => {
    if (existing && existing.id !== actionId) {
      setActionId(existing.id);
      setText(existing.draftText);
    }
  }, [existing, actionId]);

  // Debounced auto-save of drafts while not submitted.
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
    if (!r.ok) setOptimisticSubmitted(false);
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
