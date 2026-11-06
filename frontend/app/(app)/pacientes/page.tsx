import Link from "next/link";
import { UserPlus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { ageInMonths, genderLabels, initials } from "@/lib/format";
import DeleteButton from "@/components/DeleteButton";

export default async function PacientesPage() {
  const patients = await prisma.patient.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { sessions: true } } },
  });

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Pacientes</h1>
          <p className="text-sm text-zinc-500">{patients.length} pacientes cadastrados</p>
        </div>
        <Link
          href="/pacientes/novo"
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <UserPlus size={16} />
          Registrar paciente
        </Link>
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-5 py-3 font-medium">Paciente</th>
              <th className="px-5 py-3 font-medium">Código</th>
              <th className="px-5 py-3 font-medium">Idade</th>
              <th className="px-5 py-3 font-medium">Gênero</th>
              <th className="px-5 py-3 font-medium">Sessões</th>
              <th className="px-5 py-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {patients.map((patient) => (
              <tr key={patient.id} className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50">
                <td className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-700">
                      {initials(patient.name)}
                    </div>
                    <span className="font-medium text-zinc-900">{patient.name}</span>
                  </div>
                </td>
                <td className="px-5 py-3 text-zinc-500">{patient.code}</td>
                <td className="px-5 py-3 text-zinc-500">{ageInMonths(patient.birthDate)} meses</td>
                <td className="px-5 py-3 text-zinc-500">{genderLabels[patient.gender]}</td>
                <td className="px-5 py-3 text-zinc-500">{patient._count.sessions}</td>
                <td className="px-5 py-3 text-right">
                  <div className="flex items-center justify-end gap-4">
                    <Link href={`/pacientes/${patient.id}`} className="text-sm font-medium text-blue-600 hover:underline">
                      Ver perfil
                    </Link>
                    <DeleteButton
                      url={`/api/patients/${patient.id}`}
                      confirmMessage={`Excluir ${patient.name} e todas as suas sessões? Essa ação não pode ser desfeita.`}
                      iconOnly
                    />
                  </div>
                </td>
              </tr>
            ))}
            {patients.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-zinc-400">
                  Nenhum paciente cadastrado ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
