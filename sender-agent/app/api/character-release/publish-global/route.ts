import { getRegions } from "@/lib/db";
import { publishGlobalCharacterRelease } from "@/lib/character-release";
import { apiError, ok } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { regionId?: string; taskId?: string };
    if (!body.regionId || !body.taskId) throw new Error("请选择全球实时发行的起始任务。");
    return ok(await publishGlobalCharacterRelease(body.regionId, body.taskId, await getRegions()));
  } catch (error) {
    return apiError(error);
  }
}
