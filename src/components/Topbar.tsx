import Link from "next/link";
import { PHASE_LABEL, type Phase } from "@/lib/phases";

export function Topbar({
  worldName,
  turnNumber,
  phase,
  date,
  you,
}: {
  worldName: string;
  turnNumber?: number;
  phase?: Phase;
  date?: string;
  you?: string;
}) {
  return (
    <div className="gb-topbar">
      <Link href="/" className="gb-logo">
        WARGAME{turnNumber !== undefined ? ` / TURN ${String(turnNumber).padStart(2, "0")}` : ""}
      </Link>
      {phase && (
        <div className="gb-phase">
          <span className="dot" />
          {PHASE_LABEL[phase]}
        </div>
      )}
      <span style={{ color: "var(--text-2)", fontSize: 12 }}>{worldName}</span>
      {date && (
        <span className="gb-mono" style={{ color: "var(--muted)", marginLeft: 12 }}>
          {date}
        </span>
      )}
      {you && (
        <div className="gb-user" style={{ marginLeft: "auto" }}>
          <div className="gb-avatar">{you[0]?.toUpperCase() ?? "?"}</div>
          {you}
        </div>
      )}
    </div>
  );
}
