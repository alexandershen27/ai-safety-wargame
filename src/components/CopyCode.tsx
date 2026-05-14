"use client";
// Click-to-copy join code. Uses the Clipboard API; falls back to a select-all hint.
import { useState } from "react";

export function CopyCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API can be blocked in some contexts; the code is still
      // visible for manual copy.
    }
  }
  return (
    <button
      type="button"
      onClick={copy}
      className="gb-mono"
      title="Click to copy"
      style={{
        fontSize: 22,
        color: "var(--accent)",
        letterSpacing: "0.4em",
        background: "none",
        border: 0,
        padding: 0,
        cursor: "pointer",
        fontFamily: "var(--mono)",
      }}
    >
      {code}
      <span
        style={{
          marginLeft: 8,
          fontSize: 10,
          color: copied ? "var(--good)" : "var(--muted)",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}
      >
        {copied ? "copied" : "copy"}
      </span>
    </button>
  );
}
