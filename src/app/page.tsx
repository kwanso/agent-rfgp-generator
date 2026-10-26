import Link from "next/link";
import { db } from "@/lib/db";
import { STAGES, STOP_STAGES } from "@/lib/workflow";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const cases = await db.case.findMany({ orderBy: { updatedAt: "desc" } });
  const stopped = cases.filter((c) => c.stage in STOP_STAGES);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">E2 case workflow</h1>
          <p className="mt-1 text-sm text-slate-500">Each column is a step in the E2 visa process. Cases move left to right; people approve every step.</p>
        </div>
        <Link href="/cases/new" className="btn-primary">
          + Identify potential applicant
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        {STAGES.map((stage, i) => {
          const items = cases.filter((c) => c.stage === stage.id);
          return (
            <section key={stage.id} className="flex flex-col rounded-xl bg-slate-100/80 p-3">
              <header className="mb-3 px-1">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold">
                    <span className="mr-1.5 text-slate-400">{i + 1}.</span>
                    {stage.label}
                  </h2>
                  <span className="rounded-full bg-white px-2 text-xs font-medium text-slate-600">{items.length}</span>
                </div>
                <p className="mt-0.5 text-[11px] text-slate-500">{stage.owner}</p>
              </header>
              <div className="flex flex-1 flex-col gap-2">
                {items.map((c) => (
                  <CaseCard key={c.id} c={c} />
                ))}
                {items.length === 0 && <p className="px-1 py-4 text-center text-xs text-slate-400">No cases</p>}
              </div>
            </section>
          );
        })}
      </div>

      {stopped.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-red-700">STOP: not proceeding as E2</h2>
          <div className="grid gap-2 md:grid-cols-3">
            {stopped.map((c) => (
              <Link key={c.id} href={`/cases/${c.id}`} className="card border-red-200 bg-red-50/40 p-3 hover:border-red-300">
                <div className="text-sm font-medium">{c.applicantName}</div>
                <div className="mt-1 text-xs text-red-700">{STOP_STAGES[c.stage as keyof typeof STOP_STAGES]}</div>
                {c.stopReason && <div className="mt-1 line-clamp-2 text-xs text-slate-500">{c.stopReason}</div>}
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function CaseCard({ c }: { c: { id: string; applicantName: string; nationality: string; businessName: string; investmentAmount: number; attorneyFlag: string | null; outcome: string | null } }) {
  return (
    <Link href={`/cases/${c.id}`} className="card block p-3 transition hover:border-emerald-400 hover:shadow">
      <div className="text-sm font-medium">{c.applicantName}</div>
      <div className="text-xs text-slate-500">{c.nationality}</div>
      <div className="mt-2 truncate text-xs text-slate-600">{c.businessName}</div>
      <div className="text-xs text-slate-500">${c.investmentAmount.toLocaleString("en-US")}</div>
      {c.attorneyFlag && <div className="mt-2 rounded bg-amber-50 px-1.5 py-1 text-[11px] text-amber-800">Attorney flag</div>}
      {c.outcome && <div className="mt-2 rounded bg-emerald-50 px-1.5 py-1 text-[11px] text-emerald-800">{c.outcome.replace(/_/g, " ")}</div>}
    </Link>
  );
}
