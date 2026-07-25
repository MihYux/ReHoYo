import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, ensureDb, getRegions, projects, regions } from "@/lib/db";
import { apiError, ok } from "@/lib/http";

export const runtime = "nodejs";

const UpdateSchema = z.object({
  selected: z.boolean().optional(),
  name: z.string().min(1).max(80).optional(),
  language: z.string().max(80).optional(),
  timezone: z.string().max(80).optional(),
  note: z.string().max(1000).optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureDb();
    const { id } = await params;
    const input = UpdateSchema.parse(await request.json());
    const [current] = await db.select().from(regions).where(eq(regions.id, id)).limit(1);
    if (!current) throw new Error("区域不存在。");
    const changedResearchInput = input.name !== undefined || input.language !== undefined || input.timezone !== undefined || input.note !== undefined;
    const nextStatus = changedResearchInput && current.analysis ? "stale" : current.status;
    await db.update(regions).set({
      ...input,
      status: nextStatus,
      updatedAt: new Date().toISOString(),
    }).where(eq(regions.id, id));
    if (current.status === "quality_passed" || input.selected !== undefined) {
      await db.update(projects).set({ planStatus: "stale", updatedAt: new Date().toISOString() }).where(eq(projects.id, "current"));
    }
    return ok({ regions: await getRegions() });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureDb();
    const { id } = await params;
    const [current] = await db.select().from(regions).where(eq(regions.id, id)).limit(1);
    if (!current) throw new Error("区域不存在。");
    if (current.preset) throw new Error("预设区域不能删除，可以取消选择。");
    await db.delete(regions).where(eq(regions.id, id));
    await db.update(projects).set({ planStatus: "stale", updatedAt: new Date().toISOString() }).where(eq(projects.id, "current"));
    return ok({ regions: await getRegions() });
  } catch (error) {
    return apiError(error);
  }
}
