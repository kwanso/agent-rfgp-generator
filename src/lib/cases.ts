import { db } from "./db";
import { getRole } from "./role";
import { CHECKLIST, STAGE_ACTOR, parseJson } from "./workflow";
import type { PacketDraft } from "./ai";

export async function log(caseId: string, actor: string, message: string) {
  await db.event.create({ data: { caseId, actor, message } });
}

// Only the role that owns the current stage may move a case forward.
export async function requireActor(caseId: string, expectedStage: string) {
  const role = await getRole();
  const c = await db.case.findUniqueOrThrow({ where: { id: caseId }, include: { documents: true } });
  if (c.stage !== expectedStage) throw new Error(`Case is no longer at ${expectedStage}.`);
  const needed = STAGE_ACTOR[expectedStage];
  if (needed && role !== needed) throw new Error(`Only the ${needed} can do this step. Switch role at the top right.`);
  return { role, c };
}

type CaseWithDocs = Awaited<ReturnType<typeof requireActor>>["c"];

export function draftInputs(c: CaseWithDocs) {
  const checked = parseJson<Record<string, boolean>>(c.checklist, {});
  const caseData = {
    applicantName: c.applicantName,
    email: c.email,
    nationality: c.nationality,
    location: c.location === "IN_US" ? "Inside the U.S." : "Outside the U.S.",
    usStatus: c.usStatus,
    currentVisa: c.currentVisa,
    businessName: c.businessName,
    businessType: c.businessType,
    investmentAmountUSD: c.investmentAmount,
    consultationChecklist: Object.fromEntries(CHECKLIST.map((i) => [i.label, checked[i.id] ?? false])),
    consultationNotes: c.consultNotes,
  };
  const docs = c.documents.map((d) => ({ kind: d.kind, extracted: parseJson(d.extracted, null) }));
  return { caseData, docs };
}

export async function saveDraft(caseId: string, role: string, draft: PacketDraft) {
  await db.case.update({
    where: { id: caseId },
    data: {
      ds160: JSON.stringify(draft.ds160),
      coverLetter: draft.coverLetter,
      missingItems: JSON.stringify(draft.missingItems),
      reviewFlags: JSON.stringify(draft.reviewFlags),
      stage: "PARALEGAL_REVIEW",
    },
  });
  const fields = draft.ds160.reduce((n, s) => n + s.fields.length, 0);
  await log(caseId, "AI", `Drafted DS-160 answer sheet (${fields} fields), cover letter, ${draft.missingItems.length} missing item(s), ${draft.reviewFlags.length} review flag(s)`);
  await log(caseId, role, "Packet sent to paralegal review");
}
