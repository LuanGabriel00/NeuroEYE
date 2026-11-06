import type { Patient } from "@/lib/types";
import { ageInMonths, genderLabels, initials } from "@/lib/format";

export default function PatientHeader({
  patient,
  badgeLabel,
  actions,
}: {
  patient: Patient;
  badgeLabel: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white px-5 py-4">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-700">
          {initials(patient.name)}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-zinc-900">{patient.name}</h2>
            <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-medium text-zinc-500">
              {patient.code}
            </span>
          </div>
          <p className="text-sm text-zinc-500">
            Idade: {ageInMonths(patient.birthDate)} meses · Gênero: {genderLabels[patient.gender]}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
          <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />
          {badgeLabel}
        </span>
        {actions}
      </div>
    </div>
  );
}
