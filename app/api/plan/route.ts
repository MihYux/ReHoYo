import { getProject, setPlan } from "@/lib/db";
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
  try {
    const plan = await request.json();
    return ok({ project: await setPlan(plan, "needs_review") });
  } catch (error) {
    return apiError(error);
  }
}
