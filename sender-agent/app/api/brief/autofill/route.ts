import { generateProjectAutofill } from "@/lib/autofill-agent";
import { ProjectInputSchema } from "@/lib/contracts";
import { db, ensureDb, eq, sources } from "@/lib/db";
import { apiError, ok } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await ensureDb();
    const project = ProjectInputSchema.parse(await request.json());
    const sourceRows = await db.select({
      id: sources.id,
      name: sources.name,
      status: sources.status,
      extractedText: sources.extractedText,
    }).from(sources).where(eq(sources.projectId, "current"));

    const hasParsedText = sourceRows.some((source) => source.extractedText.trim().length > 0);
    if (!hasParsedText && !project.gameName.trim() && !project.versionName.trim()) {
      throw new Error("请先上传并解析内部资料，或至少填写游戏名称或版本名称。");
    }

    return ok(await generateProjectAutofill(project, sourceRows));
  } catch (error) {
    return apiError(error);
  }
}
