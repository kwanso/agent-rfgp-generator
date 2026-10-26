"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// Milestones we can spot in the streamed JSON as the AI writes it.
const PARTS = [
  { key: "coverLetter", label: "Cover letter" },
  { key: "missingItems", label: "Missing items" },
  { key: "reviewFlags", label: "Review flags for attorney" },
];

export function DraftPacketButton({ caseId, disabled }: { caseId: string; disabled: boolean }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string>();
  const [startedAt, setStartedAt] = useState(0);
  const [now, setNow] = useState(0);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [running]);

  async function run() {
    setRunning(true);
    setError(undefined);
    setText("");
    setStartedAt(Date.now());
    setNow(Date.now());
    try {
      const res = await fetch(`/api/cases/${caseId}/draft`, { method: "POST" });
      if (!res.body) throw new Error("No response from server.");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as { type: "text"; text: string } | { type: "done" } | { type: "error"; message: string };
          if (event.type === "text") setText((t) => t + event.text);
          else if (event.type === "error") throw new Error(event.message);
          else if (event.type === "done") {
            router.refresh();
            return;
          }
        }
      }
      throw new Error("The draft stopped before finishing. Try again.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setRunning(false);
    }
  }

  const sections = [...text.matchAll(/"section"\s*:\s*"([^"]+)"/g)].map((m) => m[1]);
  const fields = (text.match(/"question"\s*:/g) ?? []).length;
  const seconds = Math.max(0, Math.round((now - startedAt) / 1000));

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button className="btn-primary" disabled={disabled || running} onClick={run}>
          {running ? `AI is drafting... ${seconds}s` : "Draft packet → paralegal review"}
        </button>
      </div>
      {running && (
        <div className="rounded-lg border border-violet-200 bg-violet-50/60 p-4 text-sm">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-medium text-violet-900">Drafting DS-160 answer sheet and cover letter</span>
            <span className="text-xs text-violet-700">{fields} DS-160 fields so far</span>
          </div>
          <ul className="space-y-1">
            {sections.map((s, i) => (
              <li key={i} className="text-violet-900">
                <span className={i < sections.length - 1 || text.includes('"coverLetter"') ? "text-emerald-600" : "animate-pulse"}>●</span> DS-160: {s}
              </li>
            ))}
            {PARTS.filter((p) => text.includes(`"${p.key}"`)).map((p) => (
              <li key={p.key} className="text-violet-900">
                <span className="text-emerald-600">●</span> {p.label}
              </li>
            ))}
            {sections.length === 0 && <li className="animate-pulse text-violet-700">Reading the case file...</li>}
          </ul>
        </div>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
