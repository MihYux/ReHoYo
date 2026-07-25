import { apiError, ok } from "@/lib/http";
import { undoPlanAgentRun } from "@/lib/plan-agent";

export const runtime = "nodejs";

export async function POST(_request: Request, { params }: { params: Promise<{ runId: string }> }) {
  try {
    const { runId } = await params;
    return ok(await undoPlanAgentRun(runId));
  } catch (error) {
    return apiError(error);
  }
}
