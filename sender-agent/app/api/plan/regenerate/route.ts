export const runtime = "nodejs";

export async function POST() {
  return Response.json({ error: "DIRECT_PLAN_REGENERATION_DISABLED", message: "Ask the final plan chat agent to change a regional section." }, { status: 405 });
}
