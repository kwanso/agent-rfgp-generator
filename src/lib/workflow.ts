// Stages of the E2 visa case workflow.
export const STAGES = [
  { id: "CONSULTATION", label: "Consultation", owner: "Attorney + Paralegal", step: "Consultation with attorney and paralegal using the E2 checklist" },
  { id: "PACKET", label: "Packet creation", owner: "Case team", step: "Create the application packet" },
  { id: "PARALEGAL_REVIEW", label: "Paralegal + DS-160", owner: "Paralegal", step: "Paralegal takes packet, reviews and prepares DS-160" },
  { id: "ATTORNEY_REVIEW", label: "Attorney review", owner: "Attorney", step: "Packet delivered to attorney for review and signature" },
  { id: "SUBMITTED", label: "Submitted", owner: "Applicant", step: "Submitted to consulate, awaiting interview date" },
] as const;

export const STOP_STAGES = {
  STOP_UNLAWFUL: "Stopped: in U.S. unlawfully",
  STOP_NOT_VIABLE: "Stopped: not a viable E2 candidate",
} as const;

export type StageId = (typeof STAGES)[number]["id"] | keyof typeof STOP_STAGES;

export function stageLabel(stage: string) {
  return STAGES.find((s) => s.id === stage)?.label ?? STOP_STAGES[stage as keyof typeof STOP_STAGES] ?? stage;
}

export const ROLES = ["Paralegal", "Attorney", "Applicant"] as const;
export type Role = (typeof ROLES)[number];

// Who may act at each stage. Automation prepares, people approve.
export const STAGE_ACTOR: Record<string, Role> = {
  CONSULTATION: "Attorney",
  PACKET: "Paralegal",
  PARALEGAL_REVIEW: "Paralegal",
  ATTORNEY_REVIEW: "Attorney",
  SUBMITTED: "Paralegal",
};

// Lawful status screening gate. Returns null when the case may proceed.
export function screen(location: string, usStatus: string | null) {
  if (location === "IN_US" && usStatus === "UNLAWFUL") {
    return { stop: "STOP_UNLAWFUL" as const, reason: "In U.S. unlawfully. Per firm guidance the applicant must self-deport first." };
  }
  return null;
}

export function attorneyFlagFor(location: string, usStatus: string | null) {
  if (location === "IN_US" && usStatus === "TPS") return "TPS is a gray area. Attorney must decide before proceeding.";
  return null;
}

// Sample E2 consultation checklist.
export const CHECKLIST = [
  { id: "treaty", label: "Applicant is a national of an E2 treaty country" },
  { id: "ownership", label: "Applicant owns at least 50% or has operational control" },
  { id: "substantial", label: "Investment is substantial relative to total business cost" },
  { id: "atRisk", label: "Funds are committed and at risk" },
  { id: "source", label: "Source of funds is lawful and can be documented" },
  { id: "real", label: "Business is a real, active commercial enterprise" },
  { id: "marginal", label: "Business is not marginal (more than a living for the applicant)" },
  { id: "develop", label: "Applicant is coming to develop and direct the business" },
] as const;

export const DOC_KINDS = [
  { id: "PASSPORT", label: "Passport", required: true },
  { id: "BANK_STATEMENT", label: "Bank statement / source of funds", required: true },
  { id: "BUSINESS_PLAN", label: "Business plan", required: true },
  { id: "OTHER", label: "Other evidence", required: false },
] as const;

export function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
