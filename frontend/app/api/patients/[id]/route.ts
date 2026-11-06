import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { patientUpdateSchema } from "@/lib/validation";
import { handleApiError, jsonError, requireDoctor } from "@/lib/api";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireDoctor();
  if (response) return response;

  const { id } = await params;
  const patient = await prisma.patient.findUnique({
    where: { id },
    include: { sessions: { orderBy: { startedAt: "desc" } } },
  });
  if (!patient) return jsonError("Paciente não encontrado", 404);

  return NextResponse.json({ patient });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireDoctor();
  if (response) return response;

  try {
    const { id } = await params;
    const body = await request.json();
    const data = patientUpdateSchema.parse(body);

    const patient = await prisma.patient.update({ where: { id }, data });
    return NextResponse.json({ patient });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireDoctor();
  if (response) return response;

  const { id } = await params;
  await prisma.patient.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
