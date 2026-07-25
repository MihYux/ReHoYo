export const runtime = "nodejs";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return Response.json({ error: "MANUAL_EVIDENCE_DISABLED", message: "Evidence is collected and verified by the research agent. Human changes are reserved for the final plan chat.", regionId: id }, { status: 405 });
}
