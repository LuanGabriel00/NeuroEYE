import { z } from "zod";

export const genderSchema = z.enum(["FEMININO", "MASCULINO", "OUTRO"]);

export const patientCreateSchema = z.object({
  name: z.string().trim().min(2, "Nome muito curto"),
  birthDate: z.coerce.date(),
  gender: genderSchema,
  guardianName: z.string().trim().min(2, "Nome do responsável muito curto"),
  guardianContact: z.string().trim().min(5, "Contato inválido"),
});

export const patientUpdateSchema = patientCreateSchema.partial();

export const sessionStartSchema = z.object({
  patientId: z.string().min(1),
});

export const trackingPointSchema = z.object({
  timeSeconds: z.number(),
  objectPosition: z.number(),
  eyePosition: z.number(),
});

export const sessionFinishSchema = z.object({
  durationSeconds: z.number().int().nonnegative(),
  trackingAccuracy: z.number().min(0).max(100).optional(),
  avgLatencyMs: z.number().min(0).optional(),
  saccadeCount: z.number().int().min(0).optional(),
  fixationDurationMs: z.number().min(0).optional(),
  series: z.array(trackingPointSchema).optional(),
});

export const sessionStatusSchema = z.object({
  status: z.enum(["EM_ANDAMENTO", "CONCLUIDA", "EM_ANALISE", "SINALIZADA"]),
  notes: z.string().trim().max(2000).optional(),
});

export const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

export const registerSchema = z.object({
  name: z.string().trim().min(2),
  email: z.string().trim().email(),
  password: z.string().min(8, "Senha deve ter ao menos 8 caracteres"),
  role: z.string().trim().min(2).optional(),
});
