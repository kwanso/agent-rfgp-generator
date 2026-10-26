import { readFile } from "node:fs/promises";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { Case, Document } from "@prisma/client";
import { DOC_KINDS, parseJson } from "./workflow";

type Ds160 = { section: string; fields: { question: string; answer: string; source: string }[] }[];

const PAGE = { w: 612, h: 792, margin: 56 };

// Standard PDF fonts only cover WinAnsi; drop anything else so drawing never throws.
const clean = (s: string) => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/[^\x20-\x7E\n]/g, "");

class Writer {
  page!: PDFPage;
  y = 0;
  constructor(private pdf: PDFDocument, private font: PDFFont, private bold: PDFFont) {
    this.newPage();
  }
  newPage() {
    this.page = this.pdf.addPage([PAGE.w, PAGE.h]);
    this.y = PAGE.h - PAGE.margin;
  }
  text(value: string, opts: { size?: number; bold?: boolean; color?: [number, number, number]; gap?: number } = {}) {
    const size = opts.size ?? 10;
    const font = opts.bold ? this.bold : this.font;
    const maxWidth = PAGE.w - PAGE.margin * 2;
    for (const paragraph of clean(value).split("\n")) {
      const words = paragraph.split(" ");
      let line = "";
      const flush = () => {
        if (this.y < PAGE.margin + size) this.newPage();
        this.page.drawText(line, { x: PAGE.margin, y: this.y, size, font, color: rgb(...(opts.color ?? [0.1, 0.1, 0.12])) });
        this.y -= size * 1.45;
        line = "";
      };
      for (const word of words) {
        const next = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(next, size) > maxWidth && line) {
          flush();
          line = word;
        } else line = next;
      }
      flush();
    }
    this.y -= opts.gap ?? 4;
  }
}

export async function buildPacket(c: Case & { documents: Document[] }) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const w = new Writer(pdf, font, bold);
  const grey: [number, number, number] = [0.4, 0.4, 0.45];

  w.text("E2 Treaty Investor Application Packet", { size: 20, bold: true, gap: 8 });
  w.text(`Applicant: ${c.applicantName} (${c.nationality})`, { size: 12 });
  w.text(`Enterprise: ${c.businessName}, ${c.businessType}`, { size: 12 });
  w.text(`Investment: USD ${c.investmentAmount.toLocaleString("en-US")}`, { size: 12, gap: 12 });
  if (c.signedBy && c.signedAt) {
    w.text(`Reviewed and signed by ${c.signedBy} on ${c.signedAt.toISOString().slice(0, 10)}`, { bold: true, color: [0.05, 0.45, 0.25], gap: 12 });
  } else {
    w.text("DRAFT - not yet signed by attorney", { bold: true, color: [0.75, 0.2, 0.15], gap: 12 });
  }

  w.text("Exhibit index", { size: 14, bold: true });
  w.text("A. Cover letter", { gap: 0 });
  w.text("B. DS-160 answer sheet", { gap: 0 });
  c.documents.forEach((d, i) => {
    const kind = DOC_KINDS.find((k) => k.id === d.kind)?.label ?? d.kind;
    w.text(`${String.fromCharCode(67 + i)}. ${kind}: ${d.filename}`, { gap: 0 });
  });

  w.newPage();
  w.text("A. Cover letter", { size: 14, bold: true, gap: 10 });
  w.text(c.coverLetter ?? "(not drafted)", { size: 10.5 });

  w.newPage();
  w.text("B. DS-160 answer sheet", { size: 14, bold: true });
  w.text("For the paralegal to enter on ceac.state.gov. This sheet is not the DS-160 itself.", { color: grey, gap: 10 });
  for (const section of parseJson<Ds160>(c.ds160, [])) {
    w.text(section.section, { size: 12, bold: true, gap: 2 });
    for (const f of section.fields) {
      w.text(`${f.question}: ${f.answer || "-"}`, { gap: 0 });
      w.text(`   source: ${f.source}`, { size: 8, color: grey, gap: 2 });
    }
    w.y -= 6;
  }

  // Append the evidence itself.
  for (const d of c.documents) {
    const bytes = await readFile(d.path).catch(() => null);
    if (!bytes) continue;
    if (d.mimeType === "application/pdf") {
      const src = await PDFDocument.load(bytes, { ignoreEncryption: true }).catch(() => null);
      if (!src) continue;
      const pages = await pdf.copyPages(src, src.getPageIndices());
      pages.forEach((p) => pdf.addPage(p));
    } else if (d.mimeType === "image/png" || d.mimeType === "image/jpeg") {
      const img = d.mimeType === "image/png" ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
      const page = pdf.addPage([PAGE.w, PAGE.h]);
      const scale = Math.min((PAGE.w - 72) / img.width, (PAGE.h - 72) / img.height, 1);
      page.drawImage(img, { x: (PAGE.w - img.width * scale) / 2, y: (PAGE.h - img.height * scale) / 2, width: img.width * scale, height: img.height * scale });
    }
  }

  return pdf.save();
}
