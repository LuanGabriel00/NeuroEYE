import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import PatientHeader from "@/components/PatientHeader";
import LiveSessionPanel from "@/components/LiveSessionPanel";

export default async function NovaSessaoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ sessionId?: string }>;
}) {
  const { id } = await params;
  const { sessionId } = await searchParams;

  const patient = await prisma.patient.findUnique({ where: { id } });
  if (!patient) notFound();

  let existingSessionId: string | null = null;
  if (sessionId) {
    const session = await prisma.session.findFirst({
      where: { id: sessionId, patientId: id, status: "EM_ANDAMENTO" },
    });
    if (session) existingSessionId = session.id;
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PatientHeader patient={patient} badgeLabel="Sessão em progresso" />
      <LiveSessionPanel patientId={patient.id} existingSessionId={existingSessionId} />
    </div>
  );
}
