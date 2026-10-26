import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getRole } from "@/lib/role";
import { CHECKLIST, DOC_KINDS, STAGES, STAGE_ACTOR, parseJson } from "@/lib/workflow";
import { attorneyDecision, saveConsultation, saveOutcome, saveParalegalReview, uploadDocument } from "@/app/actions";
import { StageBadge } from "@/components/StageBadge";
import { WorkflowStepper } from "@/components/WorkflowStepper";
import { AttorneyPanel, ConsultationPanel, OutcomePanel, PacketPanel, ParalegalPanel, type Ds160 } from "@/components/panels";
import type { Extraction } from "@/lib/ai";

export const dynamic = "force-dynamic";

export default async function CasePage(props: PageProps<"/cases/[id]">) {
  const { id } = await props.params;
  const [c, role] = await Promise.all([
    db.case.findUnique({ where: { id }, include: { documents: { orderBy: { createdAt: "asc" } }, events: { orderBy: { createdAt: "desc" } } } }),
    getRole(),
  ]);
  if (!c) notFound();

  const owner = STAGE_ACTOR[c.stage];
  const canAct = !owner || owner === role;
  const docs = c.documents.map((d) => ({ id: d.id, kind: d.kind, filename: d.filename, extracted: parseJson<Extraction | null>(d.extracted, null) }));
  const ds160 = parseJson<Ds160>(c.ds160, []);
  const missingItems = parseJson<string[]>(c.missingItems, []);
  const reviewFlags = parseJson<string[]>(c.reviewFlags, []);
  const stageInfo = STAGES.find((s) => s.id === c.stage);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/" className="text-sm text-slate-500 hover:text-slate-800">
          ← Workflow
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{c.applicantName}</h1>
          <StageBadge stage={c.stage} />
        </div>
        <p className="mt-1 text-sm text-slate-500">
          {c.nationality} · {c.businessName} ({c.businessType}) · ${c.investmentAmount.toLocaleString("en-US")}
        </p>
      </div>

      <WorkflowStepper stage={c.stage} />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          {c.attorneyFlag && <Notice tone="amber" title="Attorney flag" body={c.attorneyFlag} />}
          {c.stopReason && c.stage.startsWith("STOP") && <Notice tone="red" title="STOP" body={c.stopReason} />}

          {stageInfo && (
            <div className={`rounded-lg px-4 py-3 text-sm ${canAct ? "bg-emerald-50 text-emerald-900" : "bg-slate-100 text-slate-700"}`}>
              <span className="font-medium">Current step:</span> {stageInfo.step}.{" "}
              {canAct ? `You are the ${role}, so you can act on it.` : `Waiting on the ${owner}. Switch role at the top right to continue the demo.`}
            </div>
          )}

          {c.stage === "CONSULTATION" && (
            <ConsultationPanel action={saveConsultation.bind(null, c.id)} disabled={!canAct} checklist={CHECKLIST.map((i) => ({ ...i }))} />
          )}
          {c.stage === "PACKET" && (
            <PacketPanel
              caseId={c.id}
              upload={uploadDocument.bind(null, c.id)}
              disabled={!canAct}
              docs={docs}
              kinds={DOC_KINDS.map((k) => ({ ...k }))}
            />
          )}
          {c.stage === "PARALEGAL_REVIEW" && (
            <ParalegalPanel action={saveParalegalReview.bind(null, c.id)} disabled={!canAct} ds160={ds160} coverLetter={c.coverLetter ?? ""} missingItems={missingItems} />
          )}
          {c.stage === "ATTORNEY_REVIEW" && (
            <AttorneyPanel action={attorneyDecision.bind(null, c.id)} disabled={!canAct} caseId={c.id} reviewFlags={reviewFlags} missingItems={missingItems} ds160={ds160} coverLetter={c.coverLetter ?? ""} />
          )}
          {c.stage === "SUBMITTED" && (
            <OutcomePanel
              action={saveOutcome.bind(null, c.id)}
              disabled={!canAct}
              caseId={c.id}
              signedBy={c.signedBy}
              signedAt={c.signedAt?.toISOString() ?? null}
              interviewDate={c.interviewDate?.toISOString().slice(0, 10) ?? ""}
              outcome={c.outcome ?? ""}
              outcomeNotes={c.outcomeNotes ?? ""}
            />
          )}
        </div>

        <aside className="space-y-6">
          <section className="card p-4">
            <h2 className="mb-3 text-sm font-semibold">Case facts</h2>
            <dl className="space-y-2 text-sm">
              <Fact k="Email" v={c.email} />
              <Fact k="Location" v={c.location === "IN_US" ? "Inside the U.S." : "Outside the U.S."} />
              {c.usStatus && <Fact k="U.S. status" v={c.usStatus + (c.currentVisa ? ` (${c.currentVisa})` : "")} />}
              <Fact k="Documents" v={String(c.documents.length)} />
              {c.signedBy && <Fact k="Signed by" v={c.signedBy} />}
            </dl>
            {c.coverLetter && (
              <a href={`/api/cases/${c.id}/packet`} target="_blank" className="btn-secondary mt-4 w-full">
                View packet PDF
              </a>
            )}
          </section>

          <section className="card p-4">
            <h2 className="mb-3 text-sm font-semibold">Activity log</h2>
            <ol className="space-y-3">
              {c.events.map((e) => (
                <li key={e.id} className="text-xs">
                  <div className="flex items-center gap-2">
                    <span className={`rounded px-1.5 py-0.5 font-medium ${e.actor === "AI" ? "bg-violet-100 text-violet-800" : e.actor === "System" ? "bg-slate-100 text-slate-700" : "bg-sky-100 text-sky-800"}`}>
                      {e.actor}
                    </span>
                    <time className="text-slate-400">{e.createdAt.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</time>
                  </div>
                  <p className="mt-1 text-slate-700">{e.message}</p>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </div>
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-slate-500">{k}</dt>
      <dd className="text-right font-medium">{v}</dd>
    </div>
  );
}

function Notice({ tone, title, body }: { tone: "amber" | "red"; title: string; body: string }) {
  const cls = tone === "red" ? "border-red-200 bg-red-50 text-red-900" : "border-amber-200 bg-amber-50 text-amber-900";
  return (
    <div className={`rounded-lg border p-4 text-sm ${cls}`}>
      <div className="font-semibold">{title}</div>
      <p className="mt-1">{body}</p>
    </div>
  );
}
