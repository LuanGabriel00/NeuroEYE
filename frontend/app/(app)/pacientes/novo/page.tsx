"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import type { Gender } from "@/lib/types";
import { genderLabels } from "@/lib/format";

function monthsSince(dateString: string) {
  if (!dateString) return "";
  const birth = new Date(dateString);
  if (Number.isNaN(birth.getTime())) return "";
  const now = new Date();
  const months = (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth());
  return Math.max(months, 0).toString();
}

const genderOptions: Gender[] = ["FEMININO", "MASCULINO", "OUTRO"];

export default function NovoPacientePage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    birthDate: "",
    gender: "MASCULINO" as Gender,
    guardianName: "",
    guardianContact: "",
  });

  const ageMonths = monthsSince(form.birthDate);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const res = await fetch("/api/patients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Não foi possível registrar o paciente");
      setSubmitting(false);
      return;
    }

    const { patient } = await res.json();
    router.push(`/pacientes/${patient.id}`);
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-3xl">
      <nav className="mb-2 text-sm text-zinc-400">
        <span>Pacientes</span> <span className="mx-1">›</span>{" "}
        <span className="text-blue-600">Novo registro</span>
      </nav>
      <h1 className="mb-6 text-2xl font-semibold text-zinc-900">Registro de novo paciente</h1>

      <form onSubmit={handleSubmit} className="rounded-xl border border-zinc-200 bg-white p-6">
        <div className="mb-5 flex items-center gap-2 text-sm font-semibold text-zinc-900">
          <UserPlus size={16} className="text-blue-600" />
          Dados do paciente
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-5">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-zinc-700">
              Nome Paciente: <span className="text-red-500">*</span>
            </span>
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Ex.: Nycollas Ramos"
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none"
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium text-zinc-700">Código Paciente</span>
            <input
              disabled
              value="Gerado automaticamente ao salvar"
              className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-400"
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium text-zinc-700">
              Data do aniversário <span className="text-red-500">*</span>
            </span>
            <input
              required
              type="date"
              value={form.birthDate}
              onChange={(e) => setForm({ ...form, birthDate: e.target.value })}
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium text-zinc-700">Idade em meses</span>
            <input
              disabled
              value={ageMonths ? `${ageMonths} Meses` : ""}
              placeholder="—"
              className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-500"
            />
          </label>

          <div className="col-span-2 text-sm">
            <span className="mb-2 block font-medium text-zinc-700">Gênero</span>
            <div className="flex gap-2">
              {genderOptions.map((option) => (
                <button
                  type="button"
                  key={option}
                  onClick={() => setForm({ ...form, gender: option })}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm ${
                    form.gender === option
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-zinc-200 text-zinc-600"
                  }`}
                >
                  <span
                    className={`h-3 w-3 rounded-full border ${
                      form.gender === option ? "border-blue-600 bg-blue-600" : "border-zinc-300"
                    }`}
                  />
                  {genderLabels[option]}
                </button>
              ))}
            </div>
          </div>

          <label className="block text-sm">
            <span className="mb-1 block font-medium text-zinc-700">
              Nome do pai/mãe <span className="text-red-500">*</span>
            </span>
            <input
              required
              value={form.guardianName}
              onChange={(e) => setForm({ ...form, guardianName: e.target.value })}
              placeholder="Ex.: Adriana Ramos"
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none"
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium text-zinc-700">
              Contato do pai/mãe <span className="text-red-500">*</span>
            </span>
            <input
              required
              value={form.guardianContact}
              onChange={(e) => setForm({ ...form, guardianContact: e.target.value })}
              placeholder="Ex.: (051) 99853-7791"
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none"
            />
          </label>
        </div>

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

        <div className="mt-6 flex justify-end">
          <button
            type="submit"
            disabled={submitting}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            <UserPlus size={16} />
            {submitting ? "Registrando..." : "Registrar paciente"}
          </button>
        </div>
      </form>
    </div>
  );
}
