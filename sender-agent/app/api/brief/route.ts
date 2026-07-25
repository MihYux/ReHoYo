import { getProject } from "@/lib/db";
import { apiError, ok } from "@/lib/http";

export const runtime = "nodejs";

export async function GET() {
  try {
    return ok({ project: await getProject() });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request) {
  await request.body?.cancel();
  return Response.json({ error: "BRIEF_HUMAN_EDIT_DISABLED", message: "The version brief is produced from the uploaded input and accepted by deterministic checks." }, { status: 405 });
}
