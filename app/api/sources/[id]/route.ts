import fs from "node:fs/promises";
import { eq } from "drizzle-orm";
import { db, ensureDb, getSources, sources } from "@/lib/db";
import { apiError, ok } from "@/lib/http";

export const runtime = "nodejs";

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureDb();
    const { id } = await params;
    const [source] = await db.select().from(sources).where(eq(sources.id, id)).limit(1);
    if (!source) throw new Error("文件不存在。");
    await fs.unlink(source.filePath).catch(() => undefined);
    await db.delete(sources).where(eq(sources.id, id));
    return ok({ sources: await getSources() });
  } catch (error) {
    return apiError(error);
  }
}
