import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, ensureDb, jobs, sources } from "@/lib/db";
import { parseLocalFile } from "@/lib/files";
import { createCloudParse } from "@/lib/glm";
import { apiError, ok } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureDb();
    const { id } = await params;
    const body = await request.json().catch(() => ({})) as { cloud?: boolean; confirm?: boolean };
    const [source] = await db.select().from(sources).where(eq(sources.id, id)).limit(1);
    if (!source) throw new Error("文件不存在。");
    if (body.cloud) {
      if (!body.confirm) throw new Error("云解析前必须明确确认文件将发送至智谱服务。");
      const taskId = await createCloudParse(source.filePath, source.extension);
      const jobId = randomUUID();
      const now = new Date().toISOString();
      await db.insert(jobs).values({ id: jobId, projectId: "current", type: "cloud_parse", scopeId: id, externalId: taskId, status: "processing", progress: 15, createdAt: now, updatedAt: now });
      await db.update(sources).set({ parser: "cloud", status: "processing", error: "", updatedAt: now }).where(eq(sources.id, id));
      return ok({ jobId }, 202);
    }
    const parsed = await parseLocalFile(source.filePath, source.extension);
    await db.update(sources).set({ parser: "local", status: parsed.needsCloud ? "needs_cloud" : "parsed", extractedText: parsed.text, error: "", updatedAt: new Date().toISOString() }).where(eq(sources.id, id));
    return ok({ status: parsed.needsCloud ? "needs_cloud" : "parsed", extractedLength: parsed.text.length });
  } catch (error) {
    return apiError(error);
  }
}
