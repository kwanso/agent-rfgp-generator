import { STAGES } from "@/lib/workflow";

// The happy path, with the two STOP exits shown where they branch off.
export function WorkflowStepper({ stage }: { stage: string }) {
  const steps = [{ id: "INTAKE", label: "Identify & screen" }, ...STAGES.map((s) => ({ id: s.id, label: s.label }))];
  const stopAt = stage === "STOP_UNLAWFUL" ? 0 : stage === "STOP_NOT_VIABLE" ? 1 : -1;
  const current = stopAt >= 0 ? stopAt : steps.findIndex((s) => s.id === stage);
  const finished = stage === "SUBMITTED";

  return (
    <ol className="card flex flex-wrap items-center gap-y-3 p-4">
      {steps.map((s, i) => {
        const done = i < current || (finished && i === current);
        const active = i === current && !finished;
        const stopped = i === stopAt;
        const circle = stopped
          ? "bg-red-600 text-white"
          : done
            ? "bg-emerald-600 text-white"
            : active
              ? "bg-white text-emerald-700 ring-2 ring-emerald-600"
              : "bg-slate-100 text-slate-400";
        return (
          <li key={s.id} className="flex items-center">
            <div className="flex items-center gap-2">
              <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${circle}`}>{stopped ? "!" : done ? "✓" : i + 1}</span>
              <span className={`text-sm ${active || stopped ? "font-semibold" : done ? "text-slate-700" : "text-slate-400"}`}>
                {s.label}
                {stopped && <span className="ml-1 text-red-600">STOP</span>}
                {finished && i === steps.length - 1 && <span className="ml-1">⭐</span>}
              </span>
            </div>
            {i < steps.length - 1 && <span className={`mx-3 h-px w-6 ${i < current ? "bg-emerald-500" : "bg-slate-200"}`} />}
          </li>
        );
      })}
    </ol>
  );
}
