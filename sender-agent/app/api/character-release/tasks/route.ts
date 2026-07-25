import { getRegions } from "@/lib/db";
import { saveCharacterReleaseTask } from "@/lib/character-release";
import type { CharacterReleaseTaskInput } from "@/lib/character-release-types";
import { apiError, ok } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { regionId?: string; input?: CharacterReleaseTaskInput };
    if (!body.regionId || !body.input) throw new Error("任务数据不完整。");
    return ok(await saveCharacterReleaseTask(body.regionId, body.input, await getRegions()));
  } catch (error) {
    return apiError(error);
  }
}

