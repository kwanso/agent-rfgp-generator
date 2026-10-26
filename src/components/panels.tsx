"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { DraftPacketButton } from "./DraftPacketButton";
import { deleteDocument, retryExtraction, type ActionState } from "@/app/actions";

type Action = (prev: ActionState, form: FormData) => Promise<ActionState>;
export type Ds160 = { section: string; fields: { question: string; answer: string; source: string }[] }[];
type Extraction = { documentType: string; matchesExpectedType: boolean; fields: { label: string; value: string }[]; summary: string; issues: string[] };

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="card p-6">
      <h2 className="text-lg font-semibold">{title}</h2>
      {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function ErrorText({ state }: { state: ActionState }) {
  return state?.error ? <p className="text-sm text-red-600">{state.error}</p> : null;
}

function AiTag() {
  return <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-violet-800">AI draft</span>;
}

// --- Step 3–4 -------------------------------------------------------------

export function ConsultationPanel({ action, disabled, checklist }: { action: Action; disabled: boolean; checklist: { id: string; label: string }[] }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <Panel title="Consultation: E2 checklist" subtitle="Attorney and paralegal go through the checklist together. The attorney decides if the case is viable.">
      <form action={formAction} className="space-y-5">
        <fieldset disabled={disabled} className="space-y-2">
          {checklist.map((item) => (
            <label key={item.id} className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 text-sm hover:bg-slate-50">
              <input type="checkbox" name={item.id} className="mt-0.5 h-4 w-4 accent-emerald-700" />
              {item.label}
            </label>
          ))}
          <div className="pt-2">
            <label className="label" htmlFor="notes">
              Consultation notes
            </label>
            <textarea id="notes" name="notes" rows={3} className="input" placeholder="Notes for the file. Required if not viable." />
          </div>
        </fieldset>
        <ErrorText state={state} />
        <div className="flex flex-wrap justify-end gap-2">
          <button name="decision" value="not_viable" className="btn-danger" disabled={disabled || pending}>
            Not viable: STOP
          </button>
          <button name="decision" value="viable" className="btn-primary" disabled={disabled || pending}>
            Viable: refer for packet creation
          </button>
        </div>
      </form>
    </Panel>
  );
}

// --- Step 5 -----------------------------------------------------------------

export function PacketPanel({
  caseId,
  upload,
  disabled,
  docs,
  kinds,
}: {
  caseId: string;
  upload: Action;
  disabled: boolean;
  docs: { id: string; kind: string; filename: string; extracted: Extraction | null }[];
  kinds: { id: string; label: string; required: boolean }[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [upState, upAction, uploading] = useActionState(async (prev: ActionState, form: FormData) => {
    const result = await upload(prev, form);
    if (!result?.error) formRef.current?.reset();
    return result;
  }, undefined);
  const [removing, startRemove] = useTransition();
  const [retrying, startRetry] = useTransition();
  const [retryError, setRetryError] = useState<string>();
  const missing = kinds.filter((k) => k.required && !docs.some((d) => d.kind === k.id));

  return (
    <Panel title="Packet creation" subtitle="Upload the applicant's documents. AI reads each one and pulls out the data the packet and DS-160 need.">
      <div className="space-y-6">
        <div className="grid gap-2 sm:grid-cols-3">
          {kinds
            .filter((k) => k.required)
            .map((k) => {
              const have = docs.some((d) => d.kind === k.id);
              return (
                <div key={k.id} className={`rounded-lg border px-3 py-2 text-xs ${have ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-200 text-slate-500"}`}>
                  {have ? "✓" : "○"} {k.label}
                </div>
              );
            })}
        </div>

        <form ref={formRef} action={upAction} className="flex flex-wrap items-end gap-3 rounded-lg border border-dashed border-slate-300 p-4">
          <div className="w-48">
            <label className="label" htmlFor="kind">
              Document type
            </label>
            <select id="kind" name="kind" className="input" disabled={disabled || uploading} defaultValue={missing[0]?.id ?? "OTHER"}>
              {kinds.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.label}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-56 flex-1">
            <label className="label" htmlFor="file">
              File (PDF or image)
            </label>
            <input id="file" name="file" type="file" accept="application/pdf,image/png,image/jpeg,image/webp" className="input py-1.5" disabled={disabled || uploading} required />
          </div>
          <button className="btn-primary" disabled={disabled || uploading}>
            {uploading ? "AI is reading..." : "Upload & extract"}
          </button>
          <div className="w-full">
            <ErrorText state={upState} />
          </div>
        </form>

        <div className="space-y-3">
          {docs.map((d) => (
            <article key={d.id} className="rounded-lg border border-slate-200">
              <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-2.5">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">
                    <a href={`/api/documents/${d.id}`} target="_blank" className="hover:underline">
                      {d.filename}
                    </a>
                  </div>
                  <div className="text-xs text-slate-500">{kinds.find((k) => k.id === d.kind)?.label}</div>
                </div>
                <div className="flex items-center gap-2">
                  {d.extracted ? (
                    <AiTag />
                  ) : (
                    <button
                      className="text-xs font-medium text-violet-700 hover:underline disabled:opacity-50"
                      disabled={disabled || retrying}
                      onClick={() => startRetry(async () => setRetryError((await retryExtraction(caseId, d.id))?.error))}
                    >
                      {retrying ? "Reading..." : "Run AI extraction"}
                    </button>
                  )}
                  <button
                    className="text-xs text-slate-400 hover:text-red-600"
                    disabled={disabled || removing}
                    onClick={() => startRemove(() => deleteDocument(caseId, d.id))}
                  >
                    Remove
                  </button>
                </div>
              </header>
              {d.extracted && (
                <div className="space-y-3 px-4 py-3">
                  <p className="text-sm text-slate-600">{d.extracted.summary}</p>
                  {!d.extracted.matchesExpectedType && (
                    <p className="text-xs text-amber-700">This looks like a {d.extracted.documentType}, not the expected document type.</p>
                  )}
                  <dl className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
                    {d.extracted.fields.map((f, i) => (
                      <div key={i} className="flex justify-between gap-3 border-b border-slate-50 py-0.5">
                        <dt className="text-slate-500">{f.label}</dt>
                        <dd className="text-right font-medium">{f.value}</dd>
                      </div>
                    ))}
                  </dl>
                  {d.extracted.issues.length > 0 && (
                    <ul className="space-y-1 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
                      {d.extracted.issues.map((issue, i) => (
                        <li key={i}>⚠ {issue}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </article>
          ))}
          {retryError && <p className="text-sm text-red-600">{retryError}</p>}
        </div>

        <div className="border-t border-slate-100 pt-5">
          <p className="mb-3 text-sm text-slate-500">
            {missing.length ? `Still missing: ${missing.map((m) => m.label).join(", ")}. You can draft anyway; AI will list the gaps.` : "All required documents are in."}
          </p>
          <DraftPacketButton caseId={caseId} disabled={disabled || docs.length === 0} />
        </div>
      </div>
    </Panel>
  );
}

// --- Step 6 -----------------------------------------------------------------

export function ParalegalPanel({ action, disabled, ds160, coverLetter, missingItems }: { action: Action; disabled: boolean; ds160: Ds160; coverLetter: string; missingItems: string[] }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <Panel title="Paralegal review & DS-160 prep" subtitle="AI filled in what it could. Fields marked NEEDS APPLICANT must be confirmed with the applicant. The DS-160 itself is still entered on ceac.state.gov.">
      <form action={formAction} className="space-y-6">
        {missingItems.length > 0 && <ListBox tone="amber" title="Missing before filing" items={missingItems} />}
        <fieldset disabled={disabled} className="space-y-6">
          <Ds160Editor ds160={ds160} />
          <div>
            <div className="mb-1 flex items-center gap-2">
              <label className="label mb-0" htmlFor="coverLetter">
                Cover letter
              </label>
              <AiTag />
            </div>
            <textarea id="coverLetter" name="coverLetter" defaultValue={coverLetter} rows={14} className="input font-serif leading-relaxed" />
          </div>
        </fieldset>
        <ErrorText state={state} />
        <div className="flex justify-end gap-2">
          <button name="intent" value="save" className="btn-secondary" disabled={disabled || pending}>
            Save edits
          </button>
          <button name="intent" value="send" className="btn-primary" disabled={disabled || pending}>
            Approve → send to attorney
          </button>
        </div>
      </form>
    </Panel>
  );
}

function Ds160Editor({ ds160 }: { ds160: Ds160 }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold">DS-160 answer sheet</h3>
        <AiTag />
      </div>
      {ds160.map((section, si) => (
        <details key={si} open={si < 2} className="rounded-lg border border-slate-200">
          <summary className="cursor-pointer px-4 py-2.5 text-sm font-medium">
            {section.section}
            <span className="ml-2 text-xs font-normal text-slate-500">
              {section.fields.filter((f) => f.source === "NEEDS APPLICANT").length > 0 && `${section.fields.filter((f) => f.source === "NEEDS APPLICANT").length} need applicant`}
            </span>
          </summary>
          <div className="grid gap-3 border-t border-slate-100 p-4 sm:grid-cols-2">
            {section.fields.map((f, fi) => (
              <div key={fi}>
                <label className="label" htmlFor={`ds160-${si}-${fi}`}>
                  {f.question}
                </label>
                <input
                  id={`ds160-${si}-${fi}`}
                  name={`ds160-${si}-${fi}`}
                  defaultValue={f.answer}
                  className={`input ${f.source === "NEEDS APPLICANT" ? "border-amber-300 bg-amber-50/50" : ""}`}
                />
                <p className={`mt-0.5 text-[11px] ${f.source === "NEEDS APPLICANT" ? "text-amber-700" : "text-slate-400"}`}>{f.source}</p>
              </div>
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}

// --- Step 7 -----------------------------------------------------------------

export function AttorneyPanel({
  action,
  disabled,
  caseId,
  reviewFlags,
  missingItems,
  ds160,
  coverLetter,
}: {
  action: Action;
  disabled: boolean;
  caseId: string;
  reviewFlags: string[];
  missingItems: string[];
  ds160: Ds160;
  coverLetter: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const needsApplicant = ds160.flatMap((s) => s.fields).filter((f) => f.source === "NEEDS APPLICANT").length;
  return (
    <Panel title="Attorney review & signature" subtitle="Nothing goes to the consulate without the attorney's sign-off.">
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="AI review flags" value={reviewFlags.length} tone={reviewFlags.length ? "amber" : "green"} />
          <Stat label="Missing items" value={missingItems.length} tone={missingItems.length ? "amber" : "green"} />
          <Stat label="DS-160 fields needing applicant" value={needsApplicant} tone={needsApplicant ? "amber" : "green"} />
        </div>
        {reviewFlags.length > 0 && <ListBox tone="violet" title="AI review notes: possible weak points (not legal advice)" items={reviewFlags} />}
        {missingItems.length > 0 && <ListBox tone="amber" title="Missing before filing" items={missingItems} />}

        <details className="rounded-lg border border-slate-200">
          <summary className="cursor-pointer px-4 py-2.5 text-sm font-medium">Cover letter</summary>
          <p className="whitespace-pre-wrap border-t border-slate-100 p-4 font-serif text-sm leading-relaxed">{coverLetter}</p>
        </details>
        <a href={`/api/cases/${caseId}/packet`} target="_blank" className="btn-secondary">
          Open full packet PDF
        </a>

        <form action={formAction} className="space-y-4 border-t border-slate-100 pt-5">
          <fieldset disabled={disabled} className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="signature">
                Sign with full name
              </label>
              <input id="signature" name="signature" className="input font-serif italic" placeholder="Attorney name" />
            </div>
            <div>
              <label className="label" htmlFor="notes">
                Notes (if returning)
              </label>
              <input id="notes" name="notes" className="input" placeholder="What needs fixing" />
            </div>
          </fieldset>
          <ErrorText state={state} />
          <div className="flex justify-end gap-2">
            <button name="intent" value="return" className="btn-secondary" disabled={disabled || pending}>
              Return to paralegal
            </button>
            <button name="intent" value="sign" className="btn-primary" disabled={disabled || pending}>
              Approve, sign & submit
            </button>
          </div>
        </form>
      </div>
    </Panel>
  );
}

// --- Step 8 + outcome -------------------------------------------------------

export function OutcomePanel({
  action,
  disabled,
  caseId,
  signedBy,
  signedAt,
  interviewDate,
  outcome,
  outcomeNotes,
}: {
  action: Action;
  disabled: boolean;
  caseId: string;
  signedBy: string | null;
  signedAt: string | null;
  interviewDate: string;
  outcome: string;
  outcomeNotes: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <Panel title="⭐ Submitted to consulate" subtitle={`Signed by ${signedBy ?? "attorney"}${signedAt ? ` on ${signedAt.slice(0, 10)}` : ""}. Applicant awaits interview date.`}>
      {/* key remounts the form so the select shows the saved value after React resets it */}
      <form key={`${outcome}|${interviewDate}|${outcomeNotes}`} action={formAction} className="space-y-4">
        <p className="rounded-lg bg-sky-50 p-3 text-xs text-sky-900">
          Recording the result: every approval, refusal or 221(g) saved here can later help flag weak applications before filing.
        </p>
        <fieldset disabled={disabled} className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="interviewDate">
              Interview date
            </label>
            <input id="interviewDate" name="interviewDate" type="date" defaultValue={interviewDate} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="outcome">
              Outcome
            </label>
            <select id="outcome" name="outcome" defaultValue={outcome} className="input">
              <option value="">Pending</option>
              <option value="APPROVED">Approved</option>
              <option value="ADMIN_PROCESSING_221G">221(g) administrative processing</option>
              <option value="REFUSED">Refused</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="outcomeNotes">
              Notes from the interview
            </label>
            <textarea id="outcomeNotes" name="outcomeNotes" defaultValue={outcomeNotes} rows={3} className="input" />
          </div>
        </fieldset>
        <ErrorText state={state} />
        <div className="flex justify-between">
          <a href={`/api/cases/${caseId}/packet`} target="_blank" className="btn-secondary">
            Signed packet PDF
          </a>
          <button className="btn-primary" disabled={disabled || pending}>
            Save
          </button>
        </div>
      </form>
    </Panel>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "amber" | "green" }) {
  return (
    <div className={`rounded-lg p-3 ${tone === "amber" ? "bg-amber-50" : "bg-emerald-50"}`}>
      <div className={`text-2xl font-semibold ${tone === "amber" ? "text-amber-800" : "text-emerald-800"}`}>{value}</div>
      <div className="text-xs text-slate-600">{label}</div>
    </div>
  );
}

function ListBox({ tone, title, items }: { tone: "amber" | "violet"; title: string; items: string[] }) {
  const cls = tone === "amber" ? "bg-amber-50 text-amber-900" : "bg-violet-50 text-violet-900";
  return (
    <div className={`rounded-lg p-4 text-sm ${cls}`}>
      <div className="mb-2 font-semibold">{title}</div>
      <ul className="list-disc space-y-1 pl-5">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
