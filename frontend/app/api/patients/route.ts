import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { patientCreateSchema } from "@/lib/validation";
import { handleApiError, requireDoctor } from "@/lib/api";
import { generatePatientCode } from "@/lib/patient-code";

export async function GET() {
  const { response } = await requireDoctor();
  if (response) return response;

  const patients = await prisma.patient.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { sessions: true } } },
  });

  return NextResponse.json({ patients });
}

export async function POST(request: NextRequest) {
  const { response } = await requireDoctor();
  if (response) return response;

  try {
    const body = await request.json();
    const data = patientCreateSchema.parse(body);
    const code = await generatePatientCode();

    const patient = await prisma.patient.create({
      data: { ...data, code },
    });

    return NextResponse.json({ patient }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
