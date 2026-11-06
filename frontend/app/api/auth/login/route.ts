import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSessionToken, verifyPassword, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { loginSchema } from "@/lib/validation";
import { handleApiError, jsonError } from "@/lib/api";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = loginSchema.parse(body);

    const doctor = await prisma.doctor.findUnique({ where: { email } });
    if (!doctor) return jsonError("E-mail ou senha inválidos", 401);

    const valid = await verifyPassword(password, doctor.passwordHash);
    if (!valid) return jsonError("E-mail ou senha inválidos", 401);

    const token = await createSessionToken({
      doctorId: doctor.id,
      name: doctor.name,
      email: doctor.email,
      role: doctor.role,
    });

    const response = NextResponse.json({
      doctor: { id: doctor.id, name: doctor.name, email: doctor.email, role: doctor.role },
    });
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
    return response;
  } catch (error) {
    return handleApiError(error);
  }
}
