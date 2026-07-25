import { getCitations, getProject, getRegions, setPlan } from "@/lib/db";
import { apiError, ok } from "@/lib/http";
import { assertNoHardViolations, validatePlanApproval } from "@/lib/governance";

export const runtime = "nodejs";

export async function POST() {
  try {
    const project = await getProject();
    if (!project.plan) throw new Error("请先生成发行方案。");
    const [regions, citations] = await Promise.all([getRegions(), getCitations()]);
    assertNoHardViolations("发行方案未通过审批门禁。", validatePlanApproval(project, regions, citations, project.plan));
    return ok({ project: await setPlan(project.plan, "approved") });
  } catch (error) {
    return apiError(error);
  }
}
