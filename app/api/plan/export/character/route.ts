import { getProject } from "@/lib/db";
import { apiError } from "@/lib/http";
import { characterSymbiosisToMarkdown } from "@/lib/markdown";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeFilename(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, "-");
}

export async function GET(request: Request) {
  try {
    const project = await getProject();
    if (!project.plan) throw new Error("当前没有可导出的角色共生发行方案。");
    if (project.planStatus !== "approved") throw new Error("请先确认最终方案，再导出角色共生发行方案。");
    const regionId = new URL(request.url).searchParams.get("regionId");
    if (!regionId) throw new Error("请选择需要导出的区域。");
    const item = project.plan.characterSymbiosisRelease.find((entry) => entry.regionId === regionId);
    if (!item) throw new Error("当前区域缺少角色共生发行方案。");
    const content = characterSymbiosisToMarkdown(project, project.plan, item);
    const filename = safeFilename(`${project.gameName || "ReHoYo"}-${project.versionName || "release"}-${item.regionName}-角色共生发行方案.md`);
    return new Response(content, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
