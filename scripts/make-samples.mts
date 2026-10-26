// Generates fictional specimen documents for the demo. No real client data.
import { writeFile } from "node:fs/promises";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

async function doc(file: string, draw: (p: { text: (t: string, x: number, y: number, size?: number, bold?: boolean) => void; box: (x: number, y: number, w: number, h: number) => void }) => void, size: [number, number] = [612, 792]) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage(size);
  draw({
    text: (t, x, y, s = 10, b = false) => page.drawText(t, { x, y, size: s, font: b ? bold : font, color: rgb(0.1, 0.1, 0.15) }),
    box: (x, y, w, h) => page.drawRectangle({ x, y, width: w, height: h, borderColor: rgb(0.5, 0.5, 0.55), borderWidth: 1 }),
  });
  page.drawText("SPECIMEN - FICTIONAL DEMO DOCUMENT", { x: 20, y: 12, size: 8, font: bold, color: rgb(0.8, 0.1, 0.1) });
  await writeFile(file, await pdf.save());
}

await doc("samples/passport-maria-gonzalez.pdf", ({ text, box }) => {
  box(30, 30, 540, 330);
  text("REINO DE ESPANA / KINGDOM OF SPAIN", 50, 330, 13, true);
  text("PASAPORTE / PASSPORT", 50, 312, 11);
  box(50, 120, 130, 170);
  text("[photo]", 95, 200, 10);
  const rows: [string, string][] = [
    ["Type / Tipo", "P"], ["Code / Codigo", "ESP"], ["Passport No. / No. de pasaporte", "PAE472915"],
    ["Surname / Apellidos", "GONZALEZ RUIZ"], ["Given names / Nombre", "MARIA ELENA"], ["Nationality / Nacionalidad", "ESPANOLA"],
    ["Date of birth / Fecha de nacimiento", "14 MAR 1986"], ["Sex / Sexo", "F"], ["Place of birth / Lugar de nacimiento", "SEVILLA"],
    ["Date of issue / Fecha de expedicion", "02 JUN 2022"], ["Date of expiry / Fecha de caducidad", "02 JUN 2032"], ["Authority / Autoridad", "DGP 41001"],
  ];
  rows.forEach(([k, v], i) => {
    const col = i % 2, row = Math.floor(i / 2);
    text(k, 200 + col * 185, 285 - row * 34, 7);
    text(v, 200 + col * 185, 274 - row * 34, 10, true);
  });
  text("P<ESPGONZALEZ<RUIZ<<MARIA<ELENA<<<<<<<<<<<<<<", 50, 80, 11);
  text("PAE4729155ESP8603144F3206022<<<<<<<<<<<<<<04", 50, 62, 11);
}, [600, 390]);

await doc("samples/bank-statement-maria-gonzalez.pdf", ({ text, box }) => {
  text("Banco Iberico Demo S.A.", 50, 740, 16, true);
  text("Account statement - Cuenta Corriente", 50, 720, 11);
  text("Account holder: Maria Elena Gonzalez Ruiz", 50, 690);
  text("Account: ES91 2100 0418 4502 0005 1332   Currency: EUR", 50, 675);
  text("Period: 01 Jul 2026 - 30 Sep 2026", 50, 660);
  box(50, 380, 512, 260);
  const rows = [
    ["Date", "Description", "Amount", "Balance"],
    ["01 Jul 2026", "Opening balance", "", "62,410.00"],
    ["15 Jul 2026", "Sale of property - Notaria Sevilla ref 2026/118", "+145,000.00", "207,410.00"],
    ["31 Jul 2026", "Salary - Hoteles del Sur SL", "+3,850.00", "211,260.00"],
    ["12 Aug 2026", "Transfer to Sol Coffee Roasters LLC (US) - equipment", "-48,200.00", "163,060.00"],
    ["31 Aug 2026", "Salary - Hoteles del Sur SL", "+3,850.00", "166,910.00"],
    ["04 Sep 2026", "Cash deposit", "+9,500.00", "176,410.00"],
    ["20 Sep 2026", "Transfer to Sol Coffee Roasters LLC (US) - lease deposit", "-22,000.00", "154,410.00"],
    ["30 Sep 2026", "Closing balance", "", "154,410.00"],
  ];
  rows.forEach((r, i) => {
    const y = 620 - i * 26;
    text(r[0], 60, y, 9, i === 0);
    text(r[1], 140, y, 9, i === 0);
    text(r[2], 400, y, 9, i === 0);
    text(r[3], 490, y, 9, i === 0);
  });
});

await doc("samples/business-plan-sol-coffee.pdf", ({ text }) => {
  text("Sol Coffee Roasters LLC - Business Plan (summary)", 50, 740, 15, true);
  const lines = [
    "Location: 412 Ocean Ave, Miami Beach, Florida 33139",
    "Business type: Specialty coffee roastery and cafe",
    "Ownership: Maria Elena Gonzalez Ruiz, 100% of membership interest",
    "Total startup cost: USD 185,000",
    "Investment committed to date: USD 77,500 (roasting equipment, lease deposit, build-out)",
    "Remaining investment held in escrow pending visa: USD 72,500",
    "Year 1 revenue projection: USD 410,000",
    "Hiring plan: 4 full-time U.S. employees in year 1, 9 by year 5",
    "Applicant role: Managing member, directs roasting operations and wholesale strategy",
    "Applicant experience: 12 years in hospitality management, certified Q Arabica grader",
  ];
  lines.forEach((l, i) => text(l, 50, 700 - i * 22, 11));
});
console.log("Samples written to samples/");
