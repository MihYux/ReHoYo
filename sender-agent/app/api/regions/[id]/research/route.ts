export const runtime = "nodejs";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return Response.json({ error: "USE_GOVERNED_BATCH_RETRY", message: "Regional research must run through the governed batch so cross-region synthesis and unchanged-input detection remain valid.", regionId: id }, { status: 409 });
}
