import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleApiError, jsonError, requireDoctor } from "@/lib/api";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireDoctor();
  if (response) return response;

  const { id } = await params;
  const sessions = await prisma.session.findMany({
    where: { patientId: id },
    orderBy: { startedAt: "desc" },
  });
  return NextResponse.json({ sessions });
}

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { doctor, response } = await requireDoctor();
  if (response) return response;

  const { id } = await params;
  const patient = await prisma.patient.findUnique({ where: { id } });
  if (!patient) return jsonError("Paciente não encontrado", 404);

  try {
    const session = await prisma.session.create({
      data: {
        patientId: patient.id,
        doctorId: doctor!.doctorId,
        status: "EM_ANDAMENTO",
      },
    });
    return NextResponse.json({ session }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
