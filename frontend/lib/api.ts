import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getCurrentDoctor } from "./session";

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function handleApiError(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: "Dados inválidos", issues: error.issues },
      { status: 422 }
    );
  }
  console.error(error);
  return jsonError("Erro interno do servidor", 500);
}

export async function requireDoctor() {
  const doctor = await getCurrentDoctor();
  if (!doctor) {
    return { doctor: null, response: jsonError("Não autenticado", 401) };
  }
  return { doctor, response: null };
}
