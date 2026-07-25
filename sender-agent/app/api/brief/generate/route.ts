import { eq } from "drizzle-orm";
import { db, ensureDb, getProject, projects, regions, setBrief, sources } from "@/lib/db";
import { apiError, ok } from "@/lib/http";
import { generateVersionBrief } from "@/lib/workflow";

export const runtime = "nodejs";
export const maxDuration = 180;

export async function POST() {
  try {
    await ensureDb();
    const project = await getProject();
    if (!project.gameName || !project.versionName) throw new Error("请先填写游戏名称和版本名称。");
    const sourceRows = await db.select().from(sources).where(eq(sources.projectId, "current"));
    if (!project.objective && !sourceRows.some((item) => item.extractedText)) throw new Error("请填写版本目标，或上传并解析至少一份内部资料。");
    if (project.briefStatus === "approved") {
      await db.update(regions).set({ status: "stale", updatedAt: new Date().toISOString() }).where(eq(regions.projectId, "current"));
    }
    await db.update(projects).set({ briefStatus: "processing", planStatus: project.plan ? "stale" : project.planStatus, updatedAt: new Date().toISOString() }).where(eq(projects.id, "current"));
    const brief = await generateVersionBrief(project, sourceRows.filter((item) => item.extractedText).map((item) => ({ id: item.id, name: item.name, text: item.extractedText })));
    if (!brief.dataFreezeDate) throw new Error("The approved input does not contain a source-linked data-freeze date.");
    return ok({ project: await setBrief(brief, "approved") });
  } catch (error) {
    await db.update(projects).set({ briefStatus: "failed", updatedAt: new Date().toISOString() }).where(eq(projects.id, "current")).catch(() => undefined);
    return apiError(error);
  }
}
