import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { registerSchema } from "@/lib/validation";
import { handleApiError, jsonError } from "@/lib/api";
import { getCurrentDoctor } from "@/lib/session";

// Open only to create the very first account (bootstrap). Once at least one
// doctor exists, creating another requires being logged in already.
export async function POST(request: NextRequest) {
  try {
    const existingCount = await prisma.doctor.count();
    if (existingCount > 0) {
      const requester = await getCurrentDoctor();
      if (!requester) return jsonError("Não autenticado", 401);
    }

    const body = await request.json();
    const data = registerSchema.parse(body);

    const existing = await prisma.doctor.findUnique({ where: { email: data.email } });
    if (existing) return jsonError("Já existe uma conta com este e-mail", 409);

    const doctor = await prisma.doctor.create({
      data: {
        name: data.name,
        email: data.email,
        role: data.role ?? "Pediatra",
        passwordHash: await hashPassword(data.password),
      },
    });

    return NextResponse.json(
      { doctor: { id: doctor.id, name: doctor.name, email: doctor.email, role: doctor.role } },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
