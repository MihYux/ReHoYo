import { apiError, ok } from "@/lib/http";
import { createPlanGenerationJob, resumePlanGenerationJob } from "@/lib/plan-generation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({})) as { resumeJobId?: string };
    const generation = body.resumeJobId
      ? await resumePlanGenerationJob(body.resumeJobId)
      : await createPlanGenerationJob();
    return ok({ jobId: generation.job.id, job: generation.job, preview: generation.preview }, 202);
  } catch (error) {
    return apiError(error);
  }
}
