import { apiError, ok } from "@/lib/http";
import { createResearchBatch } from "@/lib/research-batch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    return ok({ batch: await createResearchBatch() }, 202);
  } catch (error) {
    return apiError(error);
  }
}
