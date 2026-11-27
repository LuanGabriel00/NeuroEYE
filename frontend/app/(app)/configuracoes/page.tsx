import { getCurrentDoctor } from "@/lib/session";

export default async function ConfiguracoesPage() {
  const doctor = await getCurrentDoctor();

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-2xl font-semibold text-zinc-900">Configurações</h1>

      <div className="rounded-xl border border-zinc-200 bg-white p-6">
        <h3 className="mb-4 text-sm font-semibold text-zinc-900">Perfil</h3>
        <div className="grid grid-cols-2 gap-5">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-zinc-700">Nome</span>
            <input
              disabled
              defaultValue={doctor?.name}
              className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-500"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-zinc-700">Função</span>
            <input
              disabled
              defaultValue={doctor?.role}
              className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-500"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-zinc-700">E-mail</span>
            <input
              disabled
              defaultValue={doctor?.email}
              className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-500"
            />
          </label>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-zinc-200 bg-white p-6">
        <h3 className="mb-4 text-sm font-semibold text-zinc-900">Calibração de sessão</h3>
        <div className="grid grid-cols-2 gap-5">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-zinc-700">Distância ideal (cm)</span>
            <input
              type="number"
              defaultValue={58}
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-zinc-700">Duração padrão da sessão (s)</span>
            <input
              type="number"
              defaultValue={300}
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </label>
        </div>
      </div>

      <p className="mt-4 text-xs text-zinc-400">
        Edição de perfil e persistência da calibração ainda não estão implementadas.
      </p>
    </div>
  );
}
