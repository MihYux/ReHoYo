import { readGlobalReleaseStatus } from "@/lib/pet-policy-publisher";
import { apiError, ok } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ batchId: string }> }) {
  try {
    const { batchId } = await context.params;
    return ok(await readGlobalReleaseStatus(batchId));
  } catch (error) {
    return apiError(error);
  }
}
