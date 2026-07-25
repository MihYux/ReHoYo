import { getRegions } from "@/lib/db";
import { addCharacterReleaseRegion } from "@/lib/character-release";
import { apiError, ok } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { code?: string; name?: string; language?: string; timezone?: string };
    if (!body.code?.trim() || !body.name?.trim()) throw new Error("区域名称和代码不能为空。");
    return ok(await addCharacterReleaseRegion({
      code: body.code.trim(), name: body.name.trim(), language: body.language?.trim() || "zh-CN", timezone: body.timezone?.trim() || "Asia/Shanghai",
    }, await getRegions()));
  } catch (error) {
    return apiError(error);
  }
}

