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
  return Response.json({ error: "DIRECT_PLAN_EDIT_DISABLED", message: "Use the final plan chat agent to change the document." }, { status: 405 });
}
