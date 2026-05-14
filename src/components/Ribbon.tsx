import Link from "next/link";
import { formatTurnDate } from "@/lib/timestep";
import type { TimestepUnit } from "@/lib/timestep";

export type RibbonTurn = {
  id: string;
  turnNumber: number;
  dateAtTurn: string;
  closedAt: string | null;
  parentTurnId: string | null;
};

/**
 * Renders the ACTIVE chain only — the parent walk from currentTurnId back to
 * root. Branches on other lanes don't appear here; they're only visible on
 * the dedicated timeline page. Rationale: the top-of-page ribbon is for
 * orientation ("where am I in the run?") — showing every branch's history
 * just confuses that.
 */
export function Ribbon({
  worldId,
  turns,
  currentTurnId,
  unit,
}: {
  worldId: string;
  turns: RibbonTurn[];
  currentTurnId: string | null;
  unit: TimestepUnit;
}) {
  const chain: RibbonTurn[] = [];
  if (currentTurnId) {
    const byId = new Map(turns.map((t) => [t.id, t]));
    let cur: string | null = currentTurnId;
    while (cur) {
      const t = byId.get(cur);
      if (!t) break;
      chain.push(t);
      cur = t.parentTurnId;
    }
    chain.reverse(); // root → tip
  }
  // Fallback: if we couldn't resolve a chain (legacy worlds), just show
  // turns in their natural order.
  const display = chain.length > 0 ? chain : turns;

  return (
    <div className="gb-ribbon">
      {display.map((t) => {
        const cls = t.closedAt ? "done" : "now";
        return (
          <Link
            key={t.id}
            href={`/world/${worldId}/timeline`}
            className={"gb-turn " + cls}
          >
            <div className="num">{String(t.turnNumber).padStart(2, "0")}</div>
            <div className="node" />
            <div className="lab">{formatTurnDate(t.dateAtTurn, unit)}</div>
          </Link>
        );
      })}
    </div>
  );
}
