import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";
import StatusBadge from "@/components/StatusBadge";
import DeleteButton from "@/components/DeleteButton";

export default async function SessoesPage() {
  const sessions = await prisma.session.findMany({
    orderBy: { startedAt: "desc" },
    include: { patient: { select: { id: true, name: true } } },
  });

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-zinc-900">Sessões</h1>
        <p className="text-sm text-zinc-500">Todas as sessões de rastreamento registradas</p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-5 py-3 font-medium">ID da Sessão</th>
              <th className="px-5 py-3 font-medium">Paciente</th>
              <th className="px-5 py-3 font-medium">Data</th>
              <th className="px-5 py-3 font-medium">Precisão</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {sessions.map((session) => (
              <tr key={session.id} className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50">
                <td className="px-5 py-3 font-medium text-zinc-900">{session.id.slice(0, 8).toUpperCase()}</td>
                <td className="px-5 py-3 text-zinc-600">{session.patient.name}</td>
                <td className="px-5 py-3 text-zinc-500">{formatDate(session.startedAt)}</td>
                <td className="px-5 py-3 text-zinc-500">
                  {session.trackingAccuracy != null ? `${session.trackingAccuracy.toFixed(1)}%` : "—"}
                </td>
                <td className="px-5 py-3">
                  <StatusBadge status={session.status} />
                </td>
                <td className="px-5 py-3 text-right">
                  <div className="flex items-center justify-end gap-4">
                    {session.status === "EM_ANDAMENTO" ? (
                      <Link
                        href={`/pacientes/${session.patient.id}/sessoes/novo?sessionId=${session.id}`}
                        className="text-sm font-medium text-blue-600 hover:underline"
                      >
                        Continuar
                      </Link>
                    ) : (
                      <Link
                        href={`/pacientes/${session.patient.id}/sessoes/${session.id}`}
                        className="text-sm font-medium text-blue-600 hover:underline"
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
            {sessions.length === 0 && (
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
  );
}
