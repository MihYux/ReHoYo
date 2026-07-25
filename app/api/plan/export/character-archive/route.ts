import { getProject } from "@/lib/db";
import { apiError } from "@/lib/http";
import { characterSymbiosisToMarkdown, markdownWordCount } from "@/lib/markdown";
import { createZip } from "@/lib/zip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeFilename(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, "-");
}

export async function GET() {
  try {
    const project = await getProject();
    if (!project.plan) throw new Error("当前没有可导出的角色共生发行方案。");
    const plan = project.plan;
    const prefix = safeFilename(`${project.gameName || "ReHoYo"}-${project.versionName || "release"}`);
    const documents = plan.characterSymbiosisRelease.map((item, index) => ({
      name: `${String(index + 1).padStart(2, "0")}-${prefix}-${safeFilename(item.regionName)}-角色共生发行方案.md`,
      content: characterSymbiosisToMarkdown(project, plan, item),
    }));
    if (!documents.length) throw new Error("角色共生发行方案尚未覆盖任何区域。");
    if (documents.length !== plan.regions.length) throw new Error(`角色共生发行方案覆盖不完整：${documents.length}/${plan.regions.length}。`);
    const invalid = documents.find((document) => markdownWordCount(document.content) <= 75);
    if (invalid) throw new Error(`${invalid.name} 必须超过 75 个词。`);
    const archive = createZip(documents, new Date(plan.generatedAt));
    return new Response(new Uint8Array(archive), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`${prefix}-角色共生发行方案.zip`)}`,
        "Content-Length": String(archive.length),
        "Cache-Control": "no-store",
        "X-Document-Count": String(documents.length),
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
