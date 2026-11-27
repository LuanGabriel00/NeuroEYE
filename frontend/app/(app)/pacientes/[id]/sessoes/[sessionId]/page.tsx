import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import PatientHeader from "@/components/PatientHeader";
import StatCard from "@/components/StatCard";
import TrackingChart from "@/components/TrackingChart";
import SessionStatusControl from "@/components/SessionStatusControl";
import DeleteButton from "@/components/DeleteButton";

export default async function SessionResultsPage({
  params,
}: {
  params: Promise<{ id: string; sessionId: string }>;
}) {
  const { id, sessionId } = await params;

  const session = await prisma.session.findFirst({
    where: { id: sessionId, patientId: id },
    include: { patient: true, trackingPoints: { orderBy: { timeSeconds: "asc" } } },
  });
  if (!session) notFound();

  return (
    <div className="mx-auto max-w-5xl">
      <PatientHeader
        patient={session.patient}
        badgeLabel="Análise dos resultados"
        actions={
          <DeleteButton
            url={`/api/sessions/${session.id}`}
            confirmMessage="Excluir esta sessão e todos os seus dados de rastreamento? Essa ação não pode ser desfeita."
            redirectTo={`/pacientes/${session.patient.id}`}
          />
        }
      />

      <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-5">
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-base font-semibold text-zinc-900">Posição do Objeto vs Posição do Olhar</h3>
          <SessionStatusControl sessionId={session.id} status={session.status} />
        </div>
        <p className="mb-4 text-sm text-zinc-500">Comparação de trajetórias de rastreamento contínuo no eixo horizontal</p>
        {session.trackingPoints.length > 0 ? (
          <TrackingChart series={session.trackingPoints} />
        ) : (
          <div className="flex h-72 items-center justify-center text-sm text-zinc-400">
            Esta sessão ainda não tem dados de rastreamento (captura do dispositivo pendente).
          </div>
        )}
      </div>

      <div className="mt-4 grid grid-cols-4 gap-4">
        <StatCard
          label="Precisão de rastreamento"
          value={session.trackingAccuracy?.toFixed(1)}
          unit={session.trackingAccuracy != null ? "%" : undefined}
        />
        <StatCard label="Latência Média" value={session.avgLatencyMs} unit={session.avgLatencyMs != null ? "ms" : undefined} />
        <StatCard
          label="Contagem de Sacadas"
          value={session.saccadeCount}
          unit={session.saccadeCount != null ? "eventos" : undefined}
        />
        <StatCard
          label="Duração de Fixação"
          value={session.fixationDurationMs}
          unit={session.fixationDurationMs != null ? "ms" : undefined}
        />
      </div>
    </div>
  );
}
