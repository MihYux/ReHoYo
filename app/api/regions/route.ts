import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db, ensureDb, getCitations, getRegions, regions } from "@/lib/db";
import { apiError, ok } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return ok({ regions: await getRegions(), citations: await getCitations() });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    await ensureDb();
    const input = z.object({ name: z.string().min(1).max(80), language: z.string().max(80).default(""), timezone: z.string().max(80).default(""), note: z.string().max(1000).default("") }).parse(await request.json());
    const id = randomUUID();
    const now = new Date().toISOString();
    await db.insert(regions).values({ id, projectId: "current", code: `custom-${id.slice(0, 8)}`, ...input, selected: true, preset: false, createdAt: now, updatedAt: now });
    return ok({ regions: await getRegions() }, 201);
  } catch (error) {
    return apiError(error);
  }
}
