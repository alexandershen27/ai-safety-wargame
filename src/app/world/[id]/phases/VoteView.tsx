"use client";
// VOTE phase view. Renders the same vote-card list as the inline one inside
// DISCUSSION, but as the entire screen — there's no drafting here.
//
// VOTE phase only occurs when Reality manually advanced from DISCUSSION while
// some seats hadn't submitted. Anyone who already submitted will see no
// difference from DISCUSSION; stragglers are now locked out of drafting.
import { VoteList } from "./VoteList";
import type { WorldView } from "@/lib/world/state";

export function VoteView({
  view,
  you,
}: {
  worldId: string;
  view: WorldView;
  you: { id: string; displayName: string };
}) {
  return (
    <div
      style={{ maxWidth: 880, margin: "0 auto", display: "flex", flexDirection: "column", gap: 12 }}
    >
      <VoteList view={view} you={you} emptyMessage="No actions were submitted this turn." />
    </div>
  );
}
