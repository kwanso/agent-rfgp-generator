// Records the workflow demo video: drives the app with Playwright, narrates with macOS `say`,
// then merges voice and video with ffmpeg. Run with the dev server up and fresh seed data:
//   npm run seed && BASE_URL=http://localhost:3000 npx tsx scripts/record-demo.mts
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";
import path from "node:path";
import { chromium, type Locator, type Page } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const VOICE = process.env.VOICE ?? "Samantha";
const OUT = path.resolve("demo-video");
const SAMPLES = path.resolve("samples");

const LINES = {
  problem: "Visa paperwork is slow and error-prone. Paralegals spend days reading documents, cross-checking numbers and filling forms, and small mistakes can cost an applicant their visa.",
  intro: "This is a small agentic workflow for E 2 visa cases. An applicant's case is opened, A.I. checks the documents, and the system builds the final R F G P file by merging everything into one PDF. Let's walk through one case, from start to finish.",
  board: "Each column on this board is a step in the E 2 process.",
  colConsult: "Consultation.",
  colPacket: "Packet creation.",
  colParalegal: "Paralegal review.",
  colAttorney: "Attorney review.",
  colSubmitted: "And submitted.",
  lukas: "Lukas is in the U.S. without lawful status, so the system stopped his case at screening.",
  ana: "Ana is on T.P.S., which is a gray area. Instead of deciding, the system flags her case for the attorney.",
  intake: "Let's add a new applicant.",
  maria: "Maria is from Spain, and lives outside the U.S. She wants to open a coffee roastery in Miami, with a one hundred and fifty thousand dollar investment.",
  screen: "When we run the screen, the system checks lawful status first.",
  locked: "We're signed in as a paralegal, and this step belongs to the attorney, so it's locked.",
  checklist: "As the attorney, here is the consultation checklist, based on the main E 2 requirements.",
  viable: "The attorney ticks it off, adds a note, and marks the case as viable.",
  packet: "Now the case moves to packet creation. We'll upload Maria's passport.",
  passport: "The A.I. reads it, and pulls out her name, passport number, date of birth, and expiry date. Nobody has to type any of this.",
  bank: "Next, her bank statement.",
  bankFlag: "Look at what the A.I. flagged. A cash deposit of nine thousand five hundred euros, with no stated source. For an E 2 case, the source of funds has to be documented.",
  plan: "And the business plan.",
  planFlag: "Here, the A.I. caught that the numbers don't add up. Thirty five thousand dollars of the total cost is unexplained, which is the kind of thing a consular officer would ask about.",
  draft: "With the documents in, we ask the A.I. to draft the packet. You can see it working through the D S 160, section by section.",
  ds160: "Here is the D S 160 answer sheet. Each answer shows where it came from.",
  needs: "When the A.I. doesn't know something, it doesn't guess. It marks the field as needs applicant, so the team can confirm it with her.",
  cover: "Below that is a first draft of the cover letter. Everything here can be edited.",
  approve: "When the paralegal is happy, they approve it, and send it to the attorney.",
  attorney: "The attorney gets everything on one screen.",
  attFlags: "Possible weak points the A.I. found.",
  attMissing: "The documents still missing.",
  attQuestions: "And the D S 160 questions the applicant still needs to answer.",
  rfgp: "The system merges the cover letter, the forms and all the documents into one final R F G P file.",
  sign: "Nothing goes to the consulate without the attorney's signature.",
  submitted: "And the application is submitted, awaiting interview.",
  outcome: "The team records the interview date, and the result. Over time, these results help the system spot weak applications earlier.",
  log: "On the right is the activity log. It shows who did what, and when.",
  wrap: "That's the full workflow. A.I. reads the documents and drafts the paperwork, and people make every decision. The final R F G P file is one merged PDF, ready to submit. We built this for E 2 visa cases, but the same workflow can be set up for any document-heavy process: collecting documents, checking them with A.I., filling forms, and producing one final file. Built by Kwanso.",
} as const;
type LineId = keyof typeof LINES;

// --- voice -----------------------------------------------------------------

rmSync(OUT, { recursive: true, force: true });
mkdirSync(path.join(OUT, "voice"), { recursive: true });
const durations = {} as Record<LineId, number>;
for (const [id, text] of Object.entries(LINES) as [LineId, string][]) {
  const file = path.join(OUT, "voice", `${id}.aiff`);
  execFileSync("say", ["-v", VOICE, "-r", "185", "-o", file, text]);
  const info = execFileSync("afinfo", [file]).toString();
  durations[id] = Number(/estimated duration: ([\d.]+)/.exec(info)?.[1] ?? 3);
}
console.log("Voice clips ready");

// --- recording -------------------------------------------------------------

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  recordVideo: { dir: OUT, size: { width: 1440, height: 900 } },
  deviceScaleFactor: 1,
});
// Headless video has no mouse pointer, so draw one that follows the mouse.
await context.addInitScript(() => {
  window.addEventListener("DOMContentLoaded", () => {
    const dot = document.createElement("div");
    dot.style.cssText =
      "position:fixed;left:0;top:0;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;background:rgba(220,38,38,.35);border:2px solid rgba(220,38,38,.9);z-index:99999;pointer-events:none;transition:transform .08s";
    document.body.appendChild(dot);
    const pos = sessionStorage.getItem("cursor");
    if (pos) dot.style.transform = `translate(${pos})`;
    window.addEventListener("mousemove", (e) => {
      const p = `${e.clientX}px,${e.clientY}px`;
      dot.style.transform = `translate(${p})`;
      sessionStorage.setItem("cursor", p);
    });
  });
});

const page = await context.newPage();
const t0 = Date.now();
const cues: { id: LineId; at: number }[] = [];
let voiceUntil = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Start a narration line now; returns when it has finished playing.
async function say(id: LineId) {
  await sleep(Math.max(0, voiceUntil - Date.now()) + 120);
  cues.push({ id, at: Date.now() - t0 });
  voiceUntil = Date.now() + durations[id] * 1000;
}
const voiceDone = () => sleep(Math.max(0, voiceUntil - Date.now()) + 150);

// Cosmetic pointer movement: never let it stop the recording.
async function moveTo(target: Locator) {
  try {
    const el = target.first();
    await el.scrollIntoViewIfNeeded({ timeout: 5000 });
    const box = await el.boundingBox({ timeout: 5000 });
    if (!box) return;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 14 });
    await sleep(120);
  } catch {
    // element not found: skip the pointer move
  }
}
async function click(target: Locator) {
  await moveTo(target);
  await target.click();
}
async function type(target: Locator, text: string) {
  await click(target);
  await target.pressSequentially(text, { delay: 22 });
}
async function role(name: "Paralegal" | "Attorney") {
  const select = page.locator("header select");
  await moveTo(select);
  await select.selectOption(name);
  await sleep(1200);
}
async function smoothScroll(to: Locator | "top", offset = 90) {
  if (to === "top") await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  else await to.first().evaluate((el, off) => window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - off, behavior: "smooth" }), offset);
  await sleep(900);
}
async function upload(file: string, kind: string) {
  const before = await page.locator("main article").count();
  await page.locator("#kind").selectOption(kind);
  await page.locator("#file").setInputFiles(path.join(SAMPLES, file));
  await click(page.getByRole("button", { name: "Upload & extract" }));
  await page.waitForFunction((n) => document.querySelectorAll("main article").length > n, before, { timeout: 120_000 });
  await page.getByRole("button", { name: "Upload & extract" }).waitFor({ timeout: 120_000 });
  await sleep(600);
}
const lastArticle = () => page.locator("main article").last();

// Point at the thing first, then start the line, so the pointer is already there when it is named.
async function sayAt(id: LineId, target?: Locator) {
  await voiceDone();
  if (target) await moveTo(target);
  await say(id);
}

async function run() {
  // Board
  await page.goto(BASE);
  await role("Paralegal");
  await page.mouse.move(720, 300);
  await sayAt("problem");
  await sayAt("intro");
  await sayAt("board", page.locator("main h1").first());
  const cols: [LineId, string][] = [["colConsult", "Consultation"], ["colPacket", "Packet creation"], ["colParalegal", "Paralegal + DS-160"], ["colAttorney", "Attorney review"], ["colSubmitted", "Submitted"]];
  for (const [id, name] of cols) await sayAt(id, page.locator("main h2", { hasText: name }).first());
  await sayAt("lukas", page.getByText("Lukas Brandt").first());
  await sayAt("ana", page.getByText("Attorney flag").first());

  // Intake
  const addLink = page.getByRole("link", { name: "+ Identify potential applicant" });
  await sayAt("intake", addLink);
  await voiceDone();
  await click(addLink);
  await page.waitForURL("**/cases/new");
  await sayAt("maria", page.locator("#applicantName"));
  await type(page.locator("#applicantName"), "Maria Elena Gonzalez Ruiz");
  await type(page.locator("#email"), "maria@example.com");
  await type(page.locator("#nationality"), "Spain");
  await type(page.locator("#businessName"), "Sol Coffee Roasters LLC");
  await type(page.locator("#businessType"), "Specialty coffee roastery and cafe");
  await type(page.locator("#investmentAmount"), "150000");
  const runScreen = page.getByRole("button", { name: "Run screen and create case" });
  await sayAt("screen", runScreen);
  await voiceDone();
  await click(runScreen);
  await page.waitForURL(/\/cases\/c/);

  // Consultation
  await sayAt("locked", page.getByText("Waiting on the Attorney").first());
  await voiceDone();
  await role("Attorney");
  await sayAt("checklist", page.getByText("Consultation: E2 checklist").first());
  await voiceDone();
  const firstBox = page.locator("main input[type=checkbox]").first();
  await sayAt("viable", firstBox);
  for (const box of await page.locator("main input[type=checkbox]").all()) {
    await click(box);
    await sleep(120);
  }
  await type(page.locator("#notes"), "Strong candidate. Confirm source of the property-sale funds.");
  await voiceDone();
  await click(page.getByRole("button", { name: "Viable: refer for packet creation" }));
  await page.getByText("Packet creation", { exact: true }).first().waitFor();
  await sleep(800);

  // Documents
  await role("Paralegal");
  await sayAt("packet", page.getByRole("button", { name: "Upload & extract" }));
  await voiceDone();
  await upload("passport-maria-gonzalez.pdf", "PASSPORT");
  await smoothScroll(lastArticle());
  await sayAt("passport", lastArticle().locator("dd").nth(2));
  await voiceDone();
  await smoothScroll(page.locator("main form").first());
  await sayAt("bank", page.getByRole("button", { name: "Upload & extract" }));
  await voiceDone();
  await upload("bank-statement-maria-gonzalez.pdf", "BANK_STATEMENT");
  await smoothScroll(lastArticle().locator("ul"), 200);
  await sayAt("bankFlag", lastArticle().locator("ul li", { hasText: /cash/i }).first().or(lastArticle().locator("ul li").first()).first());
  await voiceDone();
  await smoothScroll(page.locator("main form").first());
  await sayAt("plan", page.getByRole("button", { name: "Upload & extract" }));
  await voiceDone();
  await upload("business-plan-sol-coffee.pdf", "BUSINESS_PLAN");
  await smoothScroll(lastArticle().locator("ul"), 200);
  await sayAt("planFlag", lastArticle().locator("ul li").first());
  await voiceDone();

  // AI draft
  const draftButton = page.getByRole("button", { name: /Draft packet/ });
  await smoothScroll(draftButton, 300);
  await sayAt("draft", draftButton);
  await click(draftButton);
  const scrollFollow = setInterval(() => page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" })).catch(() => {}), 1500);
  await page.getByText("Paralegal review & DS-160 prep").first().waitFor({ timeout: 180_000 });
  clearInterval(scrollFollow);
  await voiceDone();
  await smoothScroll(page.locator("main details").first(), 120);
  await sayAt("ds160", page.locator("main details").first().locator("input").first());
  const needs = page.locator("main details[open] p", { hasText: "NEEDS APPLICANT" }).first();
  await voiceDone();
  if (await needs.count()) {
    await smoothScroll(needs, 300);
    await sayAt("needs", needs);
  }
  await voiceDone();
  await smoothScroll(page.locator("#coverLetter"), 160);
  await sayAt("cover", page.locator("#coverLetter"));
  const approveBtn = page.getByRole("button", { name: "Approve → send to attorney" });
  await sayAt("approve", approveBtn);
  await voiceDone();
  await click(approveBtn);
  await page.getByText("Attorney review & signature").first().waitFor();

  // Attorney
  await role("Attorney");
  await smoothScroll(page.getByText("Attorney review & signature").first(), 120);
  await sayAt("attorney", page.getByText("Attorney review & signature").first());
  await sayAt("attFlags", page.locator(".bg-violet-50").first());
  await sayAt("attMissing", page.getByText("Missing before filing").first());
  await sayAt("attQuestions", page.getByText("DS-160 fields needing applicant").first());
  await sayAt("rfgp", page.getByRole("link", { name: "Open full packet PDF" }));
  await voiceDone();
  await sayAt("sign", page.locator("#signature"));
  await type(page.locator("#signature"), "Jane Attorney, Esq");
  await voiceDone();
  await click(page.getByRole("button", { name: "Approve, sign & submit" }));
  await page.getByText("Submitted to consulate").first().waitFor();
  await sleep(1200);

  // Submitted + outcome
  await smoothScroll("top");
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(400);
  await sayAt("submitted", page.locator("main ol").first().locator("li").last());
  await voiceDone();
  await role("Paralegal");
  await sayAt("outcome", page.locator("#interviewDate"));
  await page.locator("#interviewDate").fill("2026-11-12");
  await moveTo(page.locator("#outcome"));
  await page.locator("#outcome").selectOption("APPROVED");
  await type(page.locator("#outcomeNotes"), "Approved at interview.");
  await voiceDone();
  await click(page.getByRole("button", { name: "Save" }));
  await sleep(800);
  await sayAt("log", page.getByText("Activity log").first());
  await voiceDone();

  // Wrap-up
  await click(page.getByRole("link", { name: "← Workflow" }));
  await page.waitForURL(BASE + "/");
  await sayAt("wrap", page.getByText("Maria Elena Gonzalez Ruiz").first());
  await voiceDone();
  await sleep(1500);
}

try {
  await run();
} finally {
  await context.close();
  await browser.close();
}

// --- merge -----------------------------------------------------------------

const raw = readdirSync(OUT).find((f) => f.endsWith(".webm"));
if (!raw) throw new Error("No video was recorded");
renameSync(path.join(OUT, raw), path.join(OUT, "raw.webm"));
// Fast-forward the silent stretches (AI waits, page loads) so the video never drags.
// Speech plays at normal speed; any silent gap longer than MAX_GAP is sped up to last MAX_GAP.
const MAX_GAP = 1.2;
const rawDur = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path.join(OUT, "raw.webm")]).toString().trim());
type Seg = { from: number; to: number; speed: number };
const segs: Seg[] = [];
let tCursor = 0;
for (const c of cues) {
  const start = c.at / 1000, end = Math.min(rawDur, start + durations[c.id]);
  const gap = start - tCursor;
  if (gap > 0.01) segs.push({ from: tCursor, to: start, speed: Math.max(1, gap / MAX_GAP) });
  segs.push({ from: start, to: end, speed: 1 });
  tCursor = end;
}
if (rawDur - tCursor > 0.01) segs.push({ from: tCursor, to: rawDur, speed: Math.max(1, (rawDur - tCursor) / 2) });
const vparts = segs.map((g, i) => `[0:v]trim=start=${g.from.toFixed(3)}:end=${g.to.toFixed(3)},setpts=(PTS-STARTPTS)/${g.speed.toFixed(4)}[v${i}]`);
const vconcat = `${segs.map((_, i) => `[v${i}]`).join("")}concat=n=${segs.length}:v=1:a=0,fps=30[vout]`;
// New start time of each line in the shortened video.
let outT = 0;
const newAt: number[] = [];
let ci = 0;
for (const g of segs) {
  if (g.speed === 1 && ci < cues.length && Math.abs(g.from - cues[ci].at / 1000) < 1e-6) newAt.push(Math.round(outT * 1000)), ci++;
  outT += (g.to - g.from) / g.speed;
}
const inputs = ["-i", path.join(OUT, "raw.webm"), ...cues.flatMap((c) => ["-i", path.join(OUT, "voice", `${c.id}.aiff`)])];
const delays = cues.map((_, i) => `[${i + 1}:a]adelay=${newAt[i]}|${newAt[i]}[a${i}]`).join(";");
const mix = `${vparts.join(";")};${vconcat};${delays};${cues.map((_, i) => `[a${i}]`).join("")}amix=inputs=${cues.length}:normalize=0[aout]`;
execFileSync("ffmpeg", ["-y", ...inputs, "-filter_complex", mix, "-map", "[vout]", "-map", "[aout]", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-c:a", "aac", "-b:a", "160k", "-shortest", path.join(OUT, "Kwanso-E2-Agentic-Workflow.mp4")], { stdio: "inherit" });
console.log(`Raw ${rawDur.toFixed(1)}s -> final ${outT.toFixed(1)}s`);
console.log(`Done: ${path.join(OUT, "Kwanso-E2-Agentic-Workflow.mp4")}`);
