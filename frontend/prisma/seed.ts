import "dotenv/config";
import { PrismaClient } from "../lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

function buildSeries(seed: number) {
  const points: { timeSeconds: number; objectPosition: number; eyePosition: number }[] = [];
  for (let t = 0; t <= 30; t += 1) {
    const object = Math.sin(t / 2 + seed) * 15;
    const eye = object + Math.sin(t * 1.3 + seed) * 3 - 1.5;
    points.push({
      timeSeconds: t,
      objectPosition: Number(object.toFixed(1)),
      eyePosition: Number(eye.toFixed(1)),
    });
  }
  return points;
}

async function main() {
  const doctor = await prisma.doctor.upsert({
    where: { email: "sarah.jenkins@neurotrack.app" },
    update: {},
    create: {
      name: "Dra. Sarah Jenkins",
      role: "Pediatra Chefe",
      email: "sarah.jenkins@neurotrack.app",
      passwordHash: await bcrypt.hash("neurotrack-dev", 10),
    },
  });

  const patientsData = [
    {
      code: "NT-2024-0847",
      name: "Nycollas Ramos",
      birthDate: new Date("2024-09-14"),
      gender: "MASCULINO" as const,
      guardianName: "Adriana Ramos",
      guardianContact: "(051) 99853-7791",
      sessions: [
        { date: "2024-10-24", durationSeconds: 312, trackingAccuracy: 89.1, status: "CONCLUIDA" as const },
        { date: "2024-10-22", durationSeconds: 285, trackingAccuracy: 87.3, status: "CONCLUIDA" as const },
        { date: "2024-10-15", durationSeconds: 210, trackingAccuracy: 72.4, status: "EM_ANALISE" as const },
        { date: "2024-10-08", durationSeconds: 375, trackingAccuracy: 88.0, status: "CONCLUIDA" as const },
        { date: "2024-09-30", durationSeconds: 130, trackingAccuracy: 45.2, status: "SINALIZADA" as const },
        { date: "2024-09-15", durationSeconds: 300, trackingAccuracy: 91.2, status: "CONCLUIDA" as const },
      ],
    },
    {
      code: "NT-2024-0612",
      name: "Helena Castro",
      birthDate: new Date("2024-03-02"),
      gender: "FEMININO" as const,
      guardianName: "Patrícia Castro",
      guardianContact: "(051) 99121-4432",
      sessions: [
        { date: "2024-10-20", durationSeconds: 260, trackingAccuracy: 93.5, status: "CONCLUIDA" as const },
        { date: "2024-10-05", durationSeconds: 240, trackingAccuracy: 81.0, status: "CONCLUIDA" as const },
      ],
    },
    {
      code: "NT-2024-0931",
      name: "Théo Martins",
      birthDate: new Date("2025-01-20"),
      gender: "MASCULINO" as const,
      guardianName: "Juliana Martins",
      guardianContact: "(051) 98877-2201",
      sessions: [
        { date: "2024-10-18", durationSeconds: 190, trackingAccuracy: 54.8, status: "SINALIZADA" as const },
      ],
    },
  ];

  let seedIndex = 0;
  for (const p of patientsData) {
    const patient = await prisma.patient.upsert({
      where: { code: p.code },
      update: {},
      create: {
        code: p.code,
        name: p.name,
        birthDate: p.birthDate,
        gender: p.gender,
        guardianName: p.guardianName,
        guardianContact: p.guardianContact,
      },
    });

    for (const s of p.sessions) {
      const existing = await prisma.session.findFirst({
        where: { patientId: patient.id, startedAt: new Date(s.date) },
      });
      if (existing) {
        seedIndex += 1;
        continue;
      }

      const startedAt = new Date(s.date);
      const endedAt = new Date(startedAt.getTime() + s.durationSeconds * 1000);
      await prisma.session.create({
        data: {
          patientId: patient.id,
          doctorId: doctor.id,
          status: s.status,
          startedAt,
          endedAt,
          durationSeconds: s.durationSeconds,
          trackingAccuracy: s.trackingAccuracy,
          avgLatencyMs: 120 + seedIndex * 7,
          saccadeCount: 18 + seedIndex * 2,
          fixationDurationMs: 280 + seedIndex * 12,
          trackingPoints: {
            create: buildSeries(seedIndex),
          },
        },
      });
      seedIndex += 1;
    }
  }

  console.log("Seed concluído:", { doctor: doctor.email, patients: patientsData.length });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
