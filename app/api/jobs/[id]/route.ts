import { eq } from "drizzle-orm";
import { db, ensureDb, jobs, sources } from "@/lib/db";
import { getCloudParse } from "@/lib/glm";
import { apiError, ok } from "@/lib/http";
import { getPlanGenerationJob, kickPlanGeneration } from "@/lib/plan-generation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureDb();
    const { id } = await params;
    let [job] = await db.select().from(jobs).where(eq(jobs.id, id)).limit(1);
    if (!job) throw new Error("任务不存在。");
    if (job.type === "plan") {
      if (job.status === "queued" || job.status === "processing") void kickPlanGeneration(id);
      const generation = await getPlanGenerationJob(id);
      return ok({ job: generation.job, preview: generation.preview });
    }
    if (job.type === "cloud_parse" && job.status === "processing") {
      const result = await getCloudParse(job.externalId);
      const now = new Date().toISOString();
      if (result.status === "succeeded") {
        await db.update(jobs).set({ status: "completed", progress: 100, updatedAt: now }).where(eq(jobs.id, id));
        await db.update(sources).set({ status: "parsed", parser: "cloud", extractedText: result.content || "", error: "", updatedAt: now }).where(eq(sources.id, job.scopeId));
      } else if (result.status === "failed") {
        await db.update(jobs).set({ status: "failed", error: result.message || "云解析失败", updatedAt: now }).where(eq(jobs.id, id));
        await db.update(sources).set({ status: "failed", error: result.message || "云解析失败", updatedAt: now }).where(eq(sources.id, job.scopeId));
      } else {
        await db.update(jobs).set({ progress: Math.min(85, job.progress + 10), updatedAt: now }).where(eq(jobs.id, id));
      }
      [job] = await db.select().from(jobs).where(eq(jobs.id, id)).limit(1);
    }
    return ok({ job });
  } catch (error) {
    return apiError(error);
  }
}
