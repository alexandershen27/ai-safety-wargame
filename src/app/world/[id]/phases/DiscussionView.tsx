"use client";
// DISCUSSION phase — combined drafting + voting.
//
// Drafts are shown ONLY for roles you haven't submitted yet. Once you've
// submitted (or skipped) an action for a role, that draft card disappears —
// your action shows up below in the unified action list with a "YOUR ACTION"
// badge.
//
// The action list below is the same VoteList component the (legacy) VOTE
// phase used. It appears as soon as your gate lifts (you've submitted every
// action you owe). Reality always sees it.
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
  // Only render a draft card for roles where this player hasn't submitted yet.
  const pendingRoles = myRoles.filter((role) => {
    const myAction = view.actions.find(
      (a) => a.roleId === role.id && a.authorPlayerId === you.id,
    );
    return !myAction?.submittedAt;
  });
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

      {/* Pending draft cards only — submitted ones live in the list below. */}
      {pendingRoles.map((role) => {
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

      {/* Unified action list. Shows everyone (incl. you) once your gate lifts. */}
      <div>
        <div className="gb-h" style={{ marginBottom: 8 }}>
          <span className="ttl">Actions</span>
          <span className="meta">
            {canSeeOthers
              ? `${view.submitProgress.submitted} of ${view.submitProgress.expected} submitted`
              : myRoles.length === 0
                ? "spectators wait for resolution"
                : "submit (or skip) all your actions to see and vote on others'"}
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
  const [skipping, setSkipping] = useState(false);

  useEffect(() => {
    if (existing && existing.id !== actionId) {
      setActionId(existing.id);
      setText(existing.draftText);
    }
  }, [existing, actionId]);

  // Debounced auto-save of drafts.
  useEffect(() => {
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
    await fetch("/api/actions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "submit", actionId: id, text }),
    });
    setSubmitting(false);
  }

  async function skip() {
    setSkipping(true);
    await fetch("/api/actions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        op: "skip",
        worldId,
        turnId,
        roleId: role.id,
        actionId,
      }),
    });
    setSkipping(false);
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
          {savedAt ? "saved" : "drafting"}
        </span>
      </div>
      <textarea
        className="gb-textarea"
        placeholder="Phrase your action as a fact: 'We do X because Y.'"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div
        style={{
          display: "flex",
          gap: 8,
          justifyContent: "flex-end",
          marginTop: 8,
        }}
      >
        <button
          className="gb-btn sm ghost"
          onClick={skip}
          disabled={submitting || skipping}
          title="Submit no action for this role this turn."
        >
          {skipping ? "Skipping…" : "Skip"}
        </button>
        <button
          className="gb-btn primary sm"
          onClick={submit}
          disabled={submitting || skipping || !text.trim()}
        >
          {submitting ? "Submitting…" : "Submit action"}
        </button>
      </div>
    </div>
  );
}
