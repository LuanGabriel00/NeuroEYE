import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";
import StatCard from "@/components/StatCard";
import StatusBadge from "@/components/StatusBadge";

export default async function ResultadosPage() {
  const sessions = await prisma.session.findMany({
    include: { patient: { select: { id: true, name: true } } },
  });

  const withAccuracy = sessions.filter((s) => s.trackingAccuracy != null);
  const avgAccuracy = withAccuracy.length
    ? withAccuracy.reduce((sum, s) => sum + s.trackingAccuracy!, 0) / withAccuracy.length
    : null;
  const flagged = sessions.filter((s) => s.status === "SINALIZADA").length;
  const inAnalysis = sessions.filter((s) => s.status === "EM_ANALISE").length;

  const latestByPatient = new Map<string, (typeof sessions)[number]>();
  for (const session of [...sessions].sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())) {
    if (!latestByPatient.has(session.patientId)) latestByPatient.set(session.patientId, session);
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-zinc-900">Resultados</h1>
        <p className="text-sm text-zinc-500">Visão geral das sessões de rastreamento</p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Total de sessões" value={sessions.length} />
        <StatCard label="Precisão média" value={avgAccuracy?.toFixed(1)} unit={avgAccuracy != null ? "%" : undefined} />
        <StatCard label="Sinalizadas" value={flagged} />
        <StatCard label="Em análise" value={inAnalysis} />
      </div>

      <div className="mt-6 rounded-xl border border-zinc-200 bg-white">
        <div className="border-b border-zinc-100 px-5 py-4">
          <h3 className="text-base font-semibold text-zinc-900">Última sessão por paciente</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="text-xs uppercase text-zinc-400">
              <tr>
                <th className="px-5 py-2 font-medium">Paciente</th>
                <th className="px-5 py-2 font-medium">Última sessão</th>
                <th className="px-5 py-2 font-medium">Precisão</th>
                <th className="px-5 py-2 font-medium">Status</th>
                <th className="px-5 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {[...latestByPatient.values()].map((session) => (
                <tr key={session.id} className="border-t border-zinc-100 hover:bg-zinc-50">
                  <td className="px-5 py-3 font-medium text-zinc-900">{session.patient.name}</td>
                  <td className="px-5 py-3 text-zinc-500">{formatDate(session.startedAt)}</td>
                  <td className="px-5 py-3 text-zinc-500">
                    {session.trackingAccuracy != null ? `${session.trackingAccuracy.toFixed(1)}%` : "—"}
                  </td>
                  <td className="px-5 py-3">
                    <StatusBadge status={session.status} />
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Link
                      href={`/pacientes/${session.patient.id}/sessoes/${session.id}`}
                      className="text-sm font-medium text-blue-600 hover:underline"
                    >
                      Ver Resultados
                    </Link>
                  </td>
                </tr>
              ))}
              {latestByPatient.size === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-zinc-400">
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
