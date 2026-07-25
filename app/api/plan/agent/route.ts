import { PlanAgentRequestSchema, type PlanAgentStreamEvent } from "@/lib/contracts";
import { apiError, ok } from "@/lib/http";
import { getPlanAgentHistory, runPlanAgent } from "@/lib/plan-agent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 240;

export async function GET(request: Request) {
  try {
    const limit = Number(new URL(request.url).searchParams.get("limit") || 20);
    return ok({ records: await getPlanAgentHistory(limit) });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const input = PlanAgentRequestSchema.parse(await request.json());
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const send = (event: PlanAgentStreamEvent) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        };
        void runPlanAgent(input, send)
          .catch((error) => send({ type: "error", message: (error as Error).message, partialApplied: false, canUndo: false }))
          .finally(() => controller.close());
      },
    });
    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
