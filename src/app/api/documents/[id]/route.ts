import { readFile } from "node:fs/promises";
import { db } from "@/lib/db";

export async function GET(_req: Request, ctx: RouteContext<"/api/documents/[id]">) {
  const { id } = await ctx.params;
  const doc = await db.document.findUnique({ where: { id } });
  if (!doc) return new Response("Not found", { status: 404 });
  const bytes = await readFile(doc.path);
  return new Response(bytes, { headers: { "Content-Type": doc.mimeType, "Content-Disposition": `inline; filename="${doc.filename}"` } });
}
