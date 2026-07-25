export const runtime = "nodejs";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return Response.json({
    error: "REGIONAL_HUMAN_APPROVAL_DISABLED",
    message: "Regional reports are accepted only by automated quality gates. Human changes are available in the final plan chat.",
    regionId: id,
  }, { status: 405 });
}
