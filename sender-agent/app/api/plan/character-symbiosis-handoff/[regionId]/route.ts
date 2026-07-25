import { getProject } from "@/lib/db";
import { apiError, ok } from "@/lib/http";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ regionId: string }> }) {
  try {
    const project = await getProject();
    if (!project.plan) return Response.json({ error: "PLAN_NOT_GENERATED" }, { status: 404 });
    if (project.planStatus !== "approved") {
      return Response.json({ error: "PLAN_NOT_APPROVED", message: "Only the final approved document can be handed to the downstream symbiosis agent." }, { status: 409 });
    }
    const { regionId } = await context.params;
    const regionalTask = project.plan.characterSymbiosisRelease.find((item) => item.regionId === regionId);
    if (!regionalTask) return Response.json({ error: "SYMBIOSIS_REGION_NOT_FOUND" }, { status: 404 });
    return ok({
      schemaVersion: 1,
      researchRunId: project.plan.researchRunId,
      generatedAt: project.plan.generatedAt,
      regionalCharacterSymbiosisPlan: regionalTask,
    });
  } catch (error) {
    return apiError(error);
  }
}
