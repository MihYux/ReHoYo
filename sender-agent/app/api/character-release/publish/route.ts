import { getRegions } from "@/lib/db";
import { publishCharacterRelease } from "@/lib/character-release";
import { apiError, ok } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { regionId?: string; taskId?: string; rolloutPercent?: number; exampleMode?: boolean };
    if (!body.regionId || !body.taskId) throw new Error("请选择需要发布的区域任务。");
    return ok(await publishCharacterRelease(body.regionId, body.taskId, Number(body.rolloutPercent || 0), Boolean(body.exampleMode), await getRegions()));
  } catch (error) {
    return apiError(error);
  }
}

