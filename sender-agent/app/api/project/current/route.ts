import fs from "node:fs/promises";
import { eq } from "drizzle-orm";
import { ProjectInputSchema } from "@/lib/contracts";
import { db, ensureDb, getCitations, getProject, getRegions, getSources, jobs, resetWorkspace, sources, updateProject, uploadDir } from "@/lib/db";
import { glmConfiguration } from "@/lib/glm";
import { searchProviderConfiguration } from "@/lib/search-providers";
import { apiError, ok } from "@/lib/http";
import { publicOperatorSettings } from "@/lib/operator-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureDb();
    const [project, regionList, sourceList, citationList, jobList] = await Promise.all([
      getProject(),
      getRegions(),
      getSources(),
      getCitations(),
      db.select({
        id: jobs.id,
        type: jobs.type,
        scopeId: jobs.scopeId,
        status: jobs.status,
        progress: jobs.progress,
        phase: jobs.phase,
        attempt: jobs.attempt,
        error: jobs.error,
        createdAt: jobs.createdAt,
        updatedAt: jobs.updatedAt,
      }).from(jobs),
    ]);
    const settings = publicOperatorSettings();
    return ok({ project, regions: regionList, sources: sourceList, citations: citationList, jobs: jobList, glm: glmConfiguration(), delivery: settings.delivery, providers: searchProviderConfiguration() });
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const input = ProjectInputSchema.parse(await request.json());
    return ok({ project: await updateProject(input) });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json().catch(() => ({})) as { confirm?: string };
    if (body.confirm !== "RESET") throw new Error("请输入 RESET 确认重置当前项目。");
    await ensureDb();
    const stored = await db.select({ filePath: sources.filePath }).from(sources).where(eq(sources.projectId, "current"));
    await Promise.all(stored.map((item) => fs.unlink(item.filePath).catch(() => undefined)));
    await fs.mkdir(uploadDir, { recursive: true });
    return ok({ project: await resetWorkspace() });
  } catch (error) {
    return apiError(error);
  }
}
