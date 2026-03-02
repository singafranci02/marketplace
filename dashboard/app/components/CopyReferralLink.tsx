"use client";

import { useState } from "react";

export function CopyReferralLink({ agent_id }: { agent_id: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const url = `${window.location.origin}/?ref=${agent_id}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for environments where clipboard API is unavailable
      const el = document.createElement("textarea");
      el.value = url;
      el.style.position = "fixed";
      el.style.opacity  = "0";
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <button
      onClick={handleCopy}
      style={{
        background:    "none",
        border:        "none",
        padding:       0,
        cursor:        "pointer",
        fontSize:      10,
        fontFamily:    "monospace",
        letterSpacing: "0.08em",
        color:         copied ? "#02f8c5" : "#444",
        transition:    "color 0.15s",
      }}
    >
      {copied ? "COPIED!" : "COPY REF LINK"}
    </button>
  );
}
