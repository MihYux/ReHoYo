import { generateProjectAutofill } from "@/lib/autofill-agent";
import { ProjectInputSchema } from "@/lib/contracts";
import { db, ensureDb, eq, sources } from "@/lib/db";
import { apiError, ok } from "@/lib/http";
import { embeddedDemoAutofillResponse } from "@/lib/embedded-demo-fixture";
import { embeddedDemoState, waitForEmbeddedDemo } from "@/lib/embedded-demo";

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

    if (embeddedDemoState(sourceRows.map((source) => ({ name: source.name, extractedText: source.extractedText }))).eligible) {
      await waitForEmbeddedDemo();
      return ok(embeddedDemoAutofillResponse());
    }

    const hasParsedText = sourceRows.some((source) => source.extractedText.trim().length > 0);
    if (!hasParsedText && !project.gameName.trim() && !project.versionName.trim()) {
      throw new Error("请先上传并解析内部资料，或至少填写游戏名称或版本名称。");
    }

    return ok(await generateProjectAutofill(project, sourceRows));
  } catch (error) {
    return apiError(error);
  }
}
