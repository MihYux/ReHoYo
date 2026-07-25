import { getRegions } from "@/lib/db";
import { importCharacterReleaseText, parseCharacterReleaseUpload } from "@/lib/character-release";
import { apiError, ok } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const regionId = String(form.get("regionId") || "");
    const file = form.get("file");
    if (!regionId || !(file instanceof File)) throw new Error("请选择区域和方案文件。");
    const content = await parseCharacterReleaseUpload(file);
    return ok(await importCharacterReleaseText(regionId, file.name, content, await getRegions()));
  } catch (error) {
    return apiError(error);
  }
}

