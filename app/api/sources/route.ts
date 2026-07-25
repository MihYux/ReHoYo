import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, ensureDb, getSources, sources, uploadDir } from "@/lib/db";
import { MAX_FILES, MAX_PROJECT_BYTES, parseLocalFile, safeFileName, validateUpload } from "@/lib/files";
import { apiError, ok } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return ok({ sources: await getSources() });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    await ensureDb();
    const current = await db.select().from(sources);
    const form = await request.formData();
    const files = form.getAll("files").filter((item): item is File => item instanceof File);
    if (!files.length) throw new Error("请选择需要上传的文件。");
    if (current.length + files.length > MAX_FILES) throw new Error(`每个项目最多上传 ${MAX_FILES} 个文件。`);
    if (current.reduce((sum, item) => sum + item.size, 0) + files.reduce((sum, file) => sum + file.size, 0) > MAX_PROJECT_BYTES) {
      throw new Error("项目文件总大小不能超过 100MB。");
    }
    for (const file of files) {
      const extension = validateUpload(file.name, file.size);
      const id = randomUUID();
      const filePath = path.join(uploadDir, `${id}-${safeFileName(file.name)}`);
      await fs.writeFile(filePath, Buffer.from(await file.arrayBuffer()));
      const now = new Date().toISOString();
      await db.insert(sources).values({ id, projectId: "current", name: file.name, extension, mimeType: file.type, size: file.size, filePath, status: "processing", createdAt: now, updatedAt: now });
      try {
        const parsed = await parseLocalFile(filePath, extension);
        await db.update(sources).set({ parser: "local", status: parsed.needsCloud ? "needs_cloud" : "parsed", extractedText: parsed.text, updatedAt: new Date().toISOString() }).where(eq(sources.id, id));
      } catch (error) {
        await db.update(sources).set({ parser: "local", status: "needs_cloud", error: (error as Error).message, updatedAt: new Date().toISOString() }).where(eq(sources.id, id));
      }
    }
    return ok({ sources: await getSources() }, 201);
  } catch (error) {
    return apiError(error);
  }
}
