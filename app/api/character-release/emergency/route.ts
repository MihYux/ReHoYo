import { getRegions } from "@/lib/db";
import { setCharacterReleaseEmergency } from "@/lib/character-release";
import { apiError, ok } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { regionId?: string; enabled?: boolean };
    if (!body.regionId) throw new Error("请选择区域。");
    return ok(await setCharacterReleaseEmergency(body.regionId, Boolean(body.enabled), await getRegions()));
  } catch (error) {
    return apiError(error);
  }
}
