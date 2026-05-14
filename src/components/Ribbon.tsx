import Link from "next/link";
import { formatTurnDate } from "@/lib/timestep";
import type { TimestepUnit } from "@/lib/timestep";

export type RibbonTurn = {
  id: string;
  turnNumber: number;
  dateAtTurn: string;
  closedAt: string | null;
};

/**
 * Renders one node per known turn (closed or open). We deliberately don't fake
 * future turns — the ribbon shows what's actually happened plus the active one.
 * The label under each node is the turn's date, formatted to the world's
 * timestep so we never show redundant precision.
 */
export function Ribbon({
  worldId,
  turns,
  unit,
}: {
  worldId: string;
  turns: RibbonTurn[];
  unit: TimestepUnit;
}) {
  return (
    <div className="gb-ribbon">
      {turns.map((t) => {
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
