import Link from "next/link";
import { notFound } from "next/navigation";
import { Calendar, Search, Video } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { formatDate, formatDuration } from "@/lib/format";
import PatientHeader from "@/components/PatientHeader";
import StatusBadge from "@/components/StatusBadge";
import DeleteButton from "@/components/DeleteButton";

export default async function PatientProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const patient = await prisma.patient.findUnique({
    where: { id },
    include: { sessions: { orderBy: { startedAt: "desc" } } },
  });
  if (!patient) notFound();

  return (
    <div className="mx-auto max-w-5xl">
      <PatientHeader
        patient={patient}
        badgeLabel="Perfil e Histórico do Paciente"
        actions={
          <DeleteButton
            url={`/api/patients/${patient.id}`}
            confirmMessage={`Excluir ${patient.name} e todas as suas sessões? Essa ação não pode ser desfeita.`}
            redirectTo="/pacientes"
          />
        }
      />

      <div className="mt-6 rounded-xl border border-zinc-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 px-5 py-4">
          <h3 className="text-base font-semibold text-zinc-900">Histórico de Sessões</h3>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm text-zinc-400">
              <Search size={14} />
              Buscar ID da sessão...
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm text-zinc-500">
              <Calendar size={14} />
              Filtrar Datas
            </div>
            <Link
              href={`/pacientes/${patient.id}/sessoes/novo`}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              <Video size={14} />
              Nova Sessão
            </Link>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs whitespace-nowrap uppercase text-zinc-400">
              <tr>
                <th className="px-5 py-2 font-medium">ID da Sessão</th>
                <th className="px-5 py-2 font-medium">Data</th>
                <th className="px-5 py-2 font-medium">Duração</th>
                <th className="px-5 py-2 font-medium">Precisão do Rastreamento</th>
                <th className="px-5 py-2 font-medium">Status</th>
                <th className="px-5 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {patient.sessions.map((session) => (
                <tr key={session.id} className="border-t border-zinc-100 whitespace-nowrap hover:bg-zinc-50">
                  <td className="px-5 py-3 font-medium text-zinc-900">{session.id.slice(0, 8).toUpperCase()}</td>
                  <td className="px-5 py-3 text-zinc-500">{formatDate(session.startedAt)}</td>
                  <td className="px-5 py-3 text-zinc-500">
                    {session.durationSeconds != null ? formatDuration(session.durationSeconds) : "—"}
                  </td>
                  <td className="px-5 py-3">
                    {session.trackingAccuracy != null ? (
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-zinc-100">
                          <div
                            className="h-full rounded-full bg-blue-600"
                            style={{ width: `${session.trackingAccuracy}%` }}
                          />
                        </div>
                        <span className="text-zinc-500">{session.trackingAccuracy.toFixed(1)}%</span>
                      </div>
                    ) : (
                      <span className="text-zinc-400">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <StatusBadge status={session.status} />
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex items-center justify-end gap-4">
                      {session.status === "EM_ANDAMENTO" ? (
                        <Link
                          href={`/pacientes/${patient.id}/sessoes/novo?sessionId=${session.id}`}
                          className="font-medium text-blue-600 hover:underline"
                        >
                          Continuar
                        </Link>
                      ) : (
                        <Link
                          href={`/pacientes/${patient.id}/sessoes/${session.id}`}
                          className="font-medium text-blue-600 hover:underline"
                        >
                          Ver Resultados
                        </Link>
                      )}
                      <DeleteButton
                        url={`/api/sessions/${session.id}`}
                        confirmMessage="Excluir esta sessão e todos os seus dados de rastreamento? Essa ação não pode ser desfeita."
                        iconOnly
                      />
                    </div>
                  </td>
                </tr>
              ))}
              {patient.sessions.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-zinc-400">
                    Nenhuma sessão registrada ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
