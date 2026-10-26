import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  await db.case.deleteMany();
  const seed = [
    { applicantName: "Kenji Watanabe", email: "kenji@example.com", nationality: "Japan", location: "OUTSIDE_US", usStatus: null, businessName: "Umami Ramen Bar LLC", businessType: "Restaurant", investmentAmount: 220000, stage: "CONSULTATION" },
    { applicantName: "Ana Morales", email: "ana@example.com", nationality: "Honduras", location: "IN_US", usStatus: "TPS", businessName: "Morales Cleaning Co", businessType: "Commercial cleaning", investmentAmount: 95000, stage: "CONSULTATION", attorneyFlag: "TPS is a gray area. Attorney must decide before proceeding." },
    { applicantName: "Lukas Brandt", email: "lukas@example.com", nationality: "Germany", location: "IN_US", usStatus: "UNLAWFUL", businessName: "Brandt Auto Detailing", businessType: "Auto services", investmentAmount: 120000, stage: "STOP_UNLAWFUL", stopReason: "In U.S. unlawfully. Per firm guidance the applicant must self-deport first." },
  ];
  for (const data of seed) {
    const c = await db.case.create({ data });
    await db.event.create({ data: { caseId: c.id, actor: "Paralegal", message: "Applicant identified and intake completed" } });
  }
  console.log(`Seeded ${seed.length} demo cases`);
}

main().finally(() => db.$disconnect());
