import Link from "next/link";

export function Ribbon({
  worldId,
  totalTurns,
  currentTurnNumber,
}: {
  worldId: string;
  totalTurns: number;
  currentTurnNumber: number;
}) {
  const items = [];
  for (let i = 1; i <= Math.max(totalTurns, currentTurnNumber); i++) {
    const cls =
      i < currentTurnNumber ? "done" : i === currentTurnNumber ? "now" : "future";
    const lab =
      i === currentTurnNumber ? "NOW" : i < currentTurnNumber ? `T-${currentTurnNumber - i}` : `T+${i - currentTurnNumber}`;
    items.push(
      <Link key={i} href={`/world/${worldId}/timeline`} className={"gb-turn " + cls}>
        <div className="num">{String(i).padStart(2, "0")}</div>
        <div className="node" />
        <div className="lab">{lab}</div>
      </Link>,
    );
  }
  return <div className="gb-ribbon">{items}</div>;
}
