import { getCitations, getProject } from "@/lib/db";
import { apiError } from "@/lib/http";
import { markdownWordCount, planToMarkdown, regionPlanToMarkdown } from "@/lib/markdown";
import { createZip } from "@/lib/zip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeFilename(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, "-");
}

export async function GET() {
  try {
    const [project, citations] = await Promise.all([getProject(), getCitations()]);
    if (!project.plan) throw new Error("当前没有可打包的发行策略。");
    const prefix = safeFilename(`${project.gameName || "ReHoYo"}-${project.versionName || "release"}`);
    const documents = [
      { name: `00-${prefix}-完整发行策略.md`, content: planToMarkdown(project, project.plan, citations) },
      ...project.plan.regions.map((region, index) => ({
        name: `${String(index + 1).padStart(2, "0")}-${prefix}-${safeFilename(region.regionName)}.md`,
        content: regionPlanToMarkdown(project, project.plan!, region, citations),
      })),
    ];
    const invalid = documents.find((document) => markdownWordCount(document.content) <= 75);
    if (invalid) throw new Error(`${invalid.name} 必须超过 75 个词。`);
    const archive = createZip(documents, new Date(project.plan.generatedAt));
    return new Response(new Uint8Array(archive), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`${prefix}-发行策略包.zip`)}`,
        "Content-Length": String(archive.length),
        "Cache-Control": "no-store",
        "X-Document-Count": String(documents.length),
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
