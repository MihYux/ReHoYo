export const runtime = "nodejs";

export async function POST() {
  return Response.json({ error: "BRIEF_HUMAN_APPROVAL_DISABLED", message: "The uploaded brief is accepted only after deterministic extraction checks." }, { status: 405 });
}
