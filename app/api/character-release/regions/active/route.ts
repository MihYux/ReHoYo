import { getRegions } from "@/lib/db";
import { setActiveCharacterReleaseRegion } from "@/lib/character-release";
import { apiError, ok } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { regionId?: string };
    if (!body.regionId) throw new Error("请选择区域。");
    return ok(await setActiveCharacterReleaseRegion(body.regionId, await getRegions()));
  } catch (error) {
    return apiError(error);
  }
}

