import { prisma } from "./prisma";

export async function generatePatientCode(): Promise<string> {
  const year = new Date().getFullYear();
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const suffix = Math.floor(1000 + Math.random() * 9000);
    const code = `NT-${year}-${suffix}`;
    const existing = await prisma.patient.findUnique({ where: { code } });
    if (!existing) return code;
  }
  throw new Error("Não foi possível gerar um código de paciente único");
}
