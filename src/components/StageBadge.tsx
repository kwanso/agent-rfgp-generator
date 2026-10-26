import { stageLabel } from "@/lib/workflow";

export function StageBadge({ stage }: { stage: string }) {
  const stop = stage.startsWith("STOP");
  const done = stage === "SUBMITTED";
  const cls = stop ? "bg-red-50 text-red-700 ring-red-200" : done ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-sky-50 text-sky-700 ring-sky-200";
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${cls}`}>{stageLabel(stage)}</span>;
}
