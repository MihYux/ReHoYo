import { getCitations, getProject } from "@/lib/db";
import { apiError } from "@/lib/http";
import { markdownWordCount, planToMarkdown, regionPlanToMarkdown } from "@/lib/markdown";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeFilename(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, "-");
}

export async function GET(request: Request) {
  try {
    const [project, citations] = await Promise.all([getProject(), getCitations()]);
    if (!project.plan) throw new Error("当前没有可导出的发行策略。");
    const regionId = new URL(request.url).searchParams.get("regionId");
    const region = regionId ? project.plan.regions.find((item) => item.regionId === regionId) : undefined;
    if (regionId && !region) throw new Error("指定区域不在当前发行策略中。");
    const content = region
      ? regionPlanToMarkdown(project, project.plan, region, citations)
      : planToMarkdown(project, project.plan, citations);
    const words = markdownWordCount(content);
    if (words <= 75) throw new Error(`导出内容必须超过 75 个词，当前为 ${words}。`);
    const scope = region ? region.regionName : "完整发行策略";
    const filename = safeFilename(`${project.gameName || "ReHoYo"}-${project.versionName || "release"}-${scope}.md`);
    return new Response(content, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "no-store",
        "X-Document-Words": String(words),
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
