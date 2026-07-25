import { apiError, ok } from "@/lib/http";
import { createDemoResearchReplay } from "@/lib/research-batch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: Promise<{ batchId: string }> }) {
  try {
    const { batchId } = await params;
    return ok({ batch: await createDemoResearchReplay(batchId) }, 202);
  } catch (error) {
    return apiError(error);
  }
}
