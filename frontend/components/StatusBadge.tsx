import type { SessionStatus } from "@/lib/types";

const labels: Record<SessionStatus, string> = {
  EM_ANDAMENTO: "Em andamento",
  CONCLUIDA: "Concluída",
  EM_ANALISE: "Em Análise",
  SINALIZADA: "Sinalizada",
};

const styles: Record<SessionStatus, string> = {
  EM_ANDAMENTO: "bg-blue-50 text-blue-700",
  CONCLUIDA: "bg-green-50 text-green-700",
  EM_ANALISE: "bg-amber-50 text-amber-700",
  SINALIZADA: "bg-red-50 text-red-700",
};

export default function StatusBadge({ status }: { status: SessionStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}
