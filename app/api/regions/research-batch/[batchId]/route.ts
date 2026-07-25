import { apiError, ok } from "@/lib/http";
import { getResearchBatch, kickResearchBatch } from "@/lib/research-batch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ batchId: string }> }) {
  try {
    const { batchId } = await params;
    const batch = await getResearchBatch(batchId);
    if ((batch.status === "queued" || batch.status === "processing") && !batch.demoCacheReplay) void kickResearchBatch(batchId);
    return ok({ batch });
  } catch (error) {
    return apiError(error);
  }
}
