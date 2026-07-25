import { getProject, setPlan } from "@/lib/db";
import { apiError, ok } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const project = await getProject();
    const body = await request.json().catch(() => ({})) as { plan?: unknown };
    const plan = body.plan ?? project.plan;
    if (!plan) throw new Error("请先生成发行方案。");
    return ok({ project: await setPlan(plan, "approved") });
  } catch (error) {
    return apiError(error);
  }
}
