"use server";

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { extractDocument } from "@/lib/ai";
import { log, requireActor } from "@/lib/cases";
import { getRole } from "@/lib/role";
import { CHECKLIST, ROLES, attorneyFlagFor, parseJson, screen, type Role } from "@/lib/workflow";

export type ActionState = { error?: string } | undefined;

const UPLOAD_DIR = path.join(process.cwd(), "uploads");
const ALLOWED_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp"];

function message(err: unknown) {
  return err instanceof Error ? err.message : "Something went wrong.";
}

export async function setRole(role: Role) {
  if (!(ROLES as readonly string[]).includes(role)) return;
  (await cookies()).set("role", role, { path: "/" });
  revalidatePath("/", "layout");
}

// Step 1–2: identify applicant and run the lawful status screen.
export async function createCase(_prev: ActionState, form: FormData): Promise<ActionState> {
  const location = String(form.get("location"));
  const usStatus = location === "IN_US" ? String(form.get("usStatus") || "LAWFUL") : null;
  const investmentAmount = Number(form.get("investmentAmount"));
  const required = ["applicantName", "email", "nationality", "businessName", "businessType"];
  if (required.some((f) => !String(form.get(f) ?? "").trim()) || !Number.isFinite(investmentAmount)) {
    return { error: "Please fill in every field." };
  }

  const gate = screen(location, usStatus);
  const role = await getRole();
  const c = await db.case.create({
    data: {
      applicantName: String(form.get("applicantName")),
      email: String(form.get("email")),
      nationality: String(form.get("nationality")),
      location,
      usStatus,
      currentVisa: String(form.get("currentVisa") || "") || null,
      businessName: String(form.get("businessName")),
      businessType: String(form.get("businessType")),
      investmentAmount,
      stage: gate ? gate.stop : "CONSULTATION",
      stopReason: gate?.reason ?? null,
      attorneyFlag: attorneyFlagFor(location, usStatus),
    },
  });
  await log(c.id, role, "Applicant identified and intake completed");
  await log(c.id, "System", gate ? `Screening: STOP. ${gate.reason}` : "Screening passed: lawful status or outside the U.S.");
  redirect(`/cases/${c.id}`);
}

// Step 3–4: checklist consultation and the viability decision.
export async function saveConsultation(caseId: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { role } = await requireActor(caseId, "CONSULTATION");
    const decision = String(form.get("decision"));
    const checklist = Object.fromEntries(CHECKLIST.map((item) => [item.id, form.get(item.id) === "on"]));
    const notes = String(form.get("notes") ?? "");

    if (decision === "viable") {
      await db.case.update({ where: { id: caseId }, data: { checklist: JSON.stringify(checklist), consultNotes: notes, stage: "PACKET" } });
      await log(caseId, role, "Consultation complete: viable E2 candidate. Referred for packet creation");
    } else {
      await db.case.update({
        where: { id: caseId },
        data: { checklist: JSON.stringify(checklist), consultNotes: notes, stage: "STOP_NOT_VIABLE", stopReason: notes || "Not a viable E2 candidate. Explore other options." },
      });
      await log(caseId, role, "Consultation complete: not a viable E2 candidate");
    }
  } catch (err) {
    return { error: message(err) };
  }
  revalidatePath(`/cases/${caseId}`);
}

// Step 5: packet creation. Upload a document and let AI read it.
export async function uploadDocument(caseId: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  let docId: string | undefined;
  try {
    const { role } = await requireActor(caseId, "PACKET");
    const file = form.get("file");
    const kind = String(form.get("kind"));
    if (!(file instanceof File) || file.size === 0) return { error: "Choose a file to upload." };
    if (!ALLOWED_TYPES.includes(file.type)) return { error: "Upload a PDF, PNG, JPG or WEBP file." };

    await mkdir(path.join(UPLOAD_DIR, caseId), { recursive: true });
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const filePath = path.join(UPLOAD_DIR, caseId, `${Date.now()}-${safeName}`);
    await writeFile(filePath, Buffer.from(await file.arrayBuffer()));

    const doc = await db.document.create({ data: { caseId, kind, filename: file.name, mimeType: file.type, path: filePath } });
    docId = doc.id;
    await log(caseId, role, `Uploaded ${kind.replace("_", " ").toLowerCase()}: ${file.name}`);

    const extracted = await extractDocument(kind, filePath, file.type);
    await db.document.update({ where: { id: doc.id }, data: { extracted: JSON.stringify(extracted) } });
    await log(caseId, "AI", `Extracted ${extracted.fields.length} fields from ${file.name}${extracted.issues.length ? `, ${extracted.issues.length} issue(s) flagged` : ""}`);
  } catch (err) {
    revalidatePath(`/cases/${caseId}`);
    return { error: docId ? `File saved, but AI extraction failed: ${message(err)}` : message(err) };
  }
  revalidatePath(`/cases/${caseId}`);
}

export async function retryExtraction(caseId: string, docId: string): Promise<ActionState> {
  try {
    const { role } = await requireActor(caseId, "PACKET");
    const doc = await db.document.findUniqueOrThrow({ where: { id: docId } });
    const extracted = await extractDocument(doc.kind, doc.path, doc.mimeType);
    await db.document.update({ where: { id: doc.id }, data: { extracted: JSON.stringify(extracted) } });
    await log(caseId, "AI", `Extracted ${extracted.fields.length} fields from ${doc.filename} (re-run by ${role})`);
  } catch (err) {
    return { error: message(err) };
  }
  revalidatePath(`/cases/${caseId}`);
}

export async function deleteDocument(caseId: string, docId: string) {
  await requireActor(caseId, "PACKET");
  await db.document.delete({ where: { id: docId } });
  revalidatePath(`/cases/${caseId}`);
}

// Step 6: paralegal edits the drafts and sends to the attorney.
export async function saveParalegalReview(caseId: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { role, c } = await requireActor(caseId, "PARALEGAL_REVIEW");
    type Section = { section: string; fields: { question: string; answer: string; source: string }[] };
    const ds160 = parseJson<Section[]>(c.ds160, []).map((s, si) => ({
      ...s,
      fields: s.fields.map((f, fi) => {
        const answer = form.get(`ds160-${si}-${fi}`);
        return answer === null || answer === f.answer ? f : { ...f, answer: String(answer), source: "Edited by paralegal" };
      }),
    }));
    const submit = form.get("intent") === "send";
    await db.case.update({
      where: { id: caseId },
      data: { ds160: JSON.stringify(ds160), coverLetter: String(form.get("coverLetter") ?? c.coverLetter), stage: submit ? "ATTORNEY_REVIEW" : c.stage },
    });
    await log(caseId, role, submit ? "Paralegal approved packet and DS-160. Delivered to attorney" : "Paralegal saved edits");
  } catch (err) {
    return { error: message(err) };
  }
  revalidatePath(`/cases/${caseId}`);
}

// Step 7: attorney signs or sends back. Nothing moves to submission without this.
export async function attorneyDecision(caseId: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { role } = await requireActor(caseId, "ATTORNEY_REVIEW");
    const signature = String(form.get("signature") ?? "").trim();
    const notes = String(form.get("notes") ?? "").trim();
    if (form.get("intent") === "return") {
      await db.case.update({ where: { id: caseId }, data: { stage: "PARALEGAL_REVIEW" } });
      await log(caseId, role, `Returned to paralegal${notes ? `: ${notes}` : ""}`);
    } else {
      if (!signature) return { error: "Type your full name to sign." };
      await db.case.update({ where: { id: caseId }, data: { stage: "SUBMITTED", signedBy: signature, signedAt: new Date(), submittedAt: new Date() } });
      await log(caseId, role, `Reviewed and signed by ${signature.replace(/\.$/, "")}. Application submitted to consulate`);
    }
  } catch (err) {
    return { error: message(err) };
  }
  revalidatePath(`/cases/${caseId}`);
}

// Step 8 and beyond: interview date and outcome. This is the data Phase 2 learns from.
export async function saveOutcome(caseId: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { role } = await requireActor(caseId, "SUBMITTED");
    const interview = String(form.get("interviewDate") ?? "");
    const outcome = String(form.get("outcome") ?? "") || null;
    await db.case.update({
      where: { id: caseId },
      data: { interviewDate: interview ? new Date(interview) : null, outcome, outcomeNotes: String(form.get("outcomeNotes") ?? "") || null },
    });
    await log(caseId, role, outcome ? `Outcome recorded: ${outcome.replace(/_/g, " ").toLowerCase()}` : "Interview details updated");
  } catch (err) {
    return { error: message(err) };
  }
  revalidatePath(`/cases/${caseId}`);
}
