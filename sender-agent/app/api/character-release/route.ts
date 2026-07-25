import { getRegions } from "@/lib/db";
import { getCharacterReleaseSnapshot } from "@/lib/character-release";
import { apiError, ok } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return ok(await getCharacterReleaseSnapshot(await getRegions()));
  } catch (error) {
    return apiError(error);
  }
}

