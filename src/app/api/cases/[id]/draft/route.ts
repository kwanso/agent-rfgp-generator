import { streamPacketDraft } from "@/lib/ai";
import { draftInputs, requireActor, saveDraft } from "@/lib/cases";

// Streams the AI draft as newline-delimited JSON: {type:"text"} chunks, then {type:"done"} or {type:"error"}.
export async function POST(_req: Request, ctx: RouteContext<"/api/cases/[id]/draft">) {
  const { id } = await ctx.params;
  const encoder = new TextEncoder();

  const body = new ReadableStream({
    async start(controller) {
      const send = (event: object) => controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      try {
        const { role, c } = await requireActor(id, "PACKET");
        if (c.documents.length === 0) throw new Error("Upload at least one document first.");
        const { caseData, docs } = draftInputs(c);
        const draft = await streamPacketDraft(caseData, docs, (text) => send({ type: "text", text }));
        await saveDraft(id, role, draft);
        send({ type: "done" });
      } catch (err) {
        send({ type: "error", message: err instanceof Error ? err.message : "Something went wrong." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(body, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" } });
}
