import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { readFile } from "node:fs/promises";
import { z } from "zod";

const MODEL = "claude-opus-5-5";

const client = new Anthropic();

// The bundled samples are fictional and watermarked SPECIMEN. In demo mode the AI is told so,
// so it doesn't flag every document as not genuine. Set DEMO_MODE=false for real documents.
const DEMO_MODE = process.env.DEMO_MODE !== "false";
const DEMO_NOTE = DEMO_MODE
  ? " This is a product demo using fictional sample documents marked SPECIMEN. Treat them as if genuine and do not mention the SPECIMEN marking or that they are samples."
  : "";

// --- Document extraction -------------------------------------------------

const ExtractionSchema = z.object({
  documentType: z.string().describe("What the document actually is, e.g. 'Passport', 'Bank statement'"),
  matchesExpectedType: z.boolean(),
  fields: z.array(z.object({ label: z.string(), value: z.string() })),
  summary: z.string().describe("One or two sentences on what this document shows"),
  issues: z.array(z.string()).describe("Problems a paralegal should check: expiry, unreadable parts, gaps, mismatches"),
});
export type Extraction = z.infer<typeof ExtractionSchema>;

const FIELD_HINTS: Record<string, string> = {
  PASSPORT:
    "Surname, Given names, Passport number, Nationality, Date of birth (YYYY-MM-DD), Sex, Place of birth, Issue date, Expiry date, Issuing authority.",
  BANK_STATEMENT:
    "Account holder, Bank name, Currency, Statement period, Opening balance, Closing balance, Large deposits (amount, date, description).",
  BUSINESS_PLAN:
    "Business name, Business type, Location, Total investment, Investment already spent, Planned U.S. hires in 5 years, Year 1 revenue projection.",
  OTHER: "The most important facts for an E2 visa application.",
};

async function fileBlock(path: string, mimeType: string): Promise<Anthropic.Beta.BetaContentBlockParam> {
  const data = (await readFile(path)).toString("base64");
  if (mimeType === "application/pdf") {
    return { type: "document", source: { type: "base64", media_type: "application/pdf", data } };
  }
  return {
    type: "image",
    source: { type: "base64", media_type: mimeType as "image/png" | "image/jpeg" | "image/webp" | "image/gif", data },
  };
}

function ensureKey() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set. Add it to .env.local and restart the dev server.");
}

function checkStop(response: { stop_reason: string | null }) {
  if (response.stop_reason === "refusal") throw new Error("The AI declined to process this request.");
  if (response.stop_reason === "max_tokens") throw new Error("The AI response was cut off. Try again.");
}

export async function extractDocument(kind: string, path: string, mimeType: string): Promise<Extraction> {
  ensureKey();
  const response = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: betaZodOutputFormat(ExtractionSchema) },
    system:
      "You extract data from immigration case documents for a paralegal at an E2 visa consulting firm. " +
      "Copy values exactly as printed. If a value is missing or unreadable, leave it out of fields and mention it in issues. Never guess." +
      DEMO_NOTE,
    messages: [
      {
        role: "user",
        content: [
          await fileBlock(path, mimeType),
          { type: "text", text: `Expected document type: ${kind}. Extract these fields where present: ${FIELD_HINTS[kind] ?? FIELD_HINTS.OTHER}` },
        ],
      },
    ],
  });
  checkStop(response);
  if (!response.parsed_output) throw new Error("Could not read the AI response.");
  return response.parsed_output;
}

// --- Packet drafting -----------------------------------------------------

const Ds160Field = z.object({
  question: z.string(),
  answer: z.string(),
  source: z.string().describe("Where the answer came from, e.g. 'Passport', 'Intake form', or 'NEEDS APPLICANT' if unknown"),
});

const PacketDraftSchema = z.object({
  ds160: z.array(
    z.object({
      section: z.string().describe("DS-160 section, e.g. 'Personal Information', 'Passport Information', 'Travel Information'"),
      fields: z.array(Ds160Field),
    }),
  ),
  coverLetter: z.string().describe("Draft cover letter to the consular officer summarising the E2 case, plain text with paragraphs"),
  missingItems: z.array(z.string()).describe("Documents or facts still needed before the packet is complete"),
  reviewFlags: z.array(z.string()).describe("Weak points an attorney should look at before filing"),
});
export type PacketDraft = z.infer<typeof PacketDraftSchema>;

export async function streamPacketDraft(
  caseData: Record<string, unknown>,
  documents: { kind: string; extracted: unknown }[],
  onText: (delta: string) => void,
): Promise<PacketDraft> {
  ensureKey();
  // Streamed so the UI can show sections arriving instead of a long silent wait.
  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 64000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: betaZodOutputFormat(PacketDraftSchema) },
    system:
      "You prepare first drafts for a paralegal at an E2 treaty investor visa firm. A paralegal and a licensed attorney review everything you write. " +
      "Use only the facts provided. When a DS-160 answer is not in the facts, write an empty answer and set source to 'NEEDS APPLICANT'. " +
      "Always leave security and background questions for the applicant to answer. Do not give legal advice and do not predict the outcome." +
      DEMO_NOTE,
    messages: [
      {
        role: "user",
        content:
          "Case intake and consultation data:\n" +
          JSON.stringify(caseData, null, 2) +
          "\n\nData extracted from uploaded documents:\n" +
          JSON.stringify(documents, null, 2) +
          "\n\nDraft the DS-160 answer sheet with sections Personal, Passport, Travel, U.S. Point of Contact, Work/Education, and Security and Background. " +
          "Keep it to the key questions, about 5 to 8 per section. Then write the cover letter, the list of missing items, and review flags for the attorney.",
      },
    ],
  });
  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") onText(event.delta.text);
  }
  const response = await stream.finalMessage();
  checkStop(response);
  if (!response.parsed_output) throw new Error("Could not read the AI response.");
  return response.parsed_output;
}
