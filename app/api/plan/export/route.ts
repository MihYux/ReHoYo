import { getCitations, getProject } from "@/lib/db";
import { apiError } from "@/lib/http";
import { planToMarkdown } from "@/lib/markdown";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [project, citations] = await Promise.all([getProject(), getCitations()]);
    if (!project.plan) throw new Error("当前没有可导出的发行方案。");
    const content = planToMarkdown(project, project.plan, citations);
    const base = `${project.gameName || "ReHoYo"}-${project.versionName || "release-plan"}.md`;
    return new Response(content, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(base)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
