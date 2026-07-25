import { apiError, ok } from "@/lib/http";
import { publicOperatorSettings, readOperatorSettingsSync, saveOperatorSettings } from "@/lib/operator-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return ok(publicOperatorSettings(readOperatorSettingsSync()));
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: Request) {
  try {
    return ok(await saveOperatorSettings(await request.json()));
  } catch (error) {
    return apiError(error);
  }
}
