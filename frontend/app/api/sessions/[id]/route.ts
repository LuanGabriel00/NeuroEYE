import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleApiError, jsonError, requireDoctor } from "@/lib/api";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireDoctor();
  if (response) return response;

  const { id } = await params;
  const session = await prisma.session.findUnique({
    where: { id },
    include: {
      patient: true,
      trackingPoints: { orderBy: { timeSeconds: "asc" } },
    },
  });
  if (!session) return jsonError("Sessão não encontrada", 404);

  return NextResponse.json({ session });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireDoctor();
  if (response) return response;

  try {
    const { id } = await params;
    await prisma.session.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
