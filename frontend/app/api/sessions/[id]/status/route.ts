import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sessionStatusSchema } from "@/lib/validation";
import { handleApiError, jsonError, requireDoctor } from "@/lib/api";

// Manual override for a doctor to mark a session EM_ANALISE / SINALIZADA /
// CONCLUIDA. No automatic rule derives this from the metrics yet.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireDoctor();
  if (response) return response;

  try {
    const { id } = await params;
    const existing = await prisma.session.findUnique({ where: { id } });
    if (!existing) return jsonError("Sessão não encontrada", 404);

    const data = sessionStatusSchema.parse(await request.json());
    const session = await prisma.session.update({
      where: { id },
      data: { status: data.status, notes: data.notes },
    });

    return NextResponse.json({ session });
  } catch (error) {
    return handleApiError(error);
  }
}
