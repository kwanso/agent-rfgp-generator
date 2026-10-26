import { db } from "@/lib/db";
import { buildPacket } from "@/lib/packet";

export async function GET(_req: Request, ctx: RouteContext<"/api/cases/[id]/packet">) {
  const { id } = await ctx.params;
  const c = await db.case.findUnique({ where: { id }, include: { documents: { orderBy: { createdAt: "asc" } } } });
  if (!c) return new Response("Not found", { status: 404 });
  const bytes = await buildPacket(c);
  const name = `E2-packet-${c.applicantName.replace(/[^a-zA-Z0-9]+/g, "-")}.pdf`;
  return new Response(Buffer.from(bytes), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${name}"` },
  });
}
