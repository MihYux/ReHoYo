import { getProject, getRegions } from "@/lib/db";
import { importCharacterReleaseText } from "@/lib/character-release";
import { characterSymbiosisToMarkdown } from "@/lib/markdown";
import { apiError, ok } from "@/lib/http";

export const runtime = "nodejs";

function safeFilename(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, "-");
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { regionId?: string };
    if (!body.regionId) throw new Error("请选择需要同步的区域。");
    const [project, regions] = await Promise.all([getProject(), getRegions()]);
    if (!project.plan) throw new Error("当前还没有角色共生发行方案，请先完成发行方案生成。");
    if (project.planStatus !== "approved") throw new Error("只能同步最终审核通过的发行方案。");
    const consoleRegion = regions.find((item) => item.id === body.regionId || item.code.toLowerCase() === body.regionId?.replace(/^region-/, "").toLowerCase());
    if (!consoleRegion) throw new Error("找不到对应的 ReHoYo 区域。");
    const item = project.plan.characterSymbiosisRelease.find((entry) => entry.regionId === consoleRegion.id);
    if (!item) throw new Error(`${consoleRegion.name}缺少角色共生发行方案。`);
    const index = project.plan.characterSymbiosisRelease.findIndex((entry) => entry.regionId === item.regionId);
    const prefix = safeFilename(`${project.gameName || "ReHoYo"}-${project.versionName || "release"}`);
    const fileName = `${String(index + 1).padStart(2, "0")}-${prefix}-${safeFilename(item.regionName)}-角色共生发行方案.md`;
    const content = characterSymbiosisToMarkdown(project, project.plan, item);
    return ok(await importCharacterReleaseText(consoleRegion.id, fileName, content, regions, {
      researchRunId: project.plan.researchRunId,
      planGeneratedAt: project.plan.generatedAt,
    }));
  } catch (error) {
    return apiError(error);
  }
}

