"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Baby, Circle, Settings, Square, Target } from "lucide-react";

function formatTimer(totalSeconds: number) {
  const h = Math.floor(totalSeconds / 3600).toString().padStart(2, "0");
  const m = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, "0");
  const s = Math.floor(totalSeconds % 60).toString().padStart(2, "0");
  return `${h}:${m}:${s}`;
}

export default function LiveSessionPanel({
  patientId,
  existingSessionId,
}: {
  patientId: string;
  existingSessionId: string | null;
}) {
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string | null>(existingSessionId);
  const [starting, setStarting] = useState(false);
  const [recording, setRecording] = useState(false);
  const [finished, setFinished] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (recording) {
      intervalRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [recording]);

  async function toggleRecording() {
    if (recording) {
      void finishSession();
      return;
    }

    setError(null);
    let activeSessionId = sessionId;
    if (!activeSessionId) {
      setStarting(true);
      try {
        const res = await fetch(`/api/patients/${patientId}/sessions`, { method: "POST" });
        if (!res.ok) throw new Error("Não foi possível iniciar a sessão");
        const { session } = await res.json();
        activeSessionId = session.id;
        setSessionId(activeSessionId);
      } catch {
        setError("Não foi possível iniciar a sessão. Tente novamente.");
        return;
      } finally {
        setStarting(false);
      }
    }

    setElapsed(0);
    setFinished(false);
    setRecording(true);
  }

  async function finishSession() {
    setRecording(false);
    if (!sessionId) return;
    setFinishing(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/finish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ durationSeconds: elapsed }),
      });
      if (!res.ok) throw new Error("Falha ao finalizar a sessão");
      setFinished(true);
    } catch {
      setError("Não foi possível salvar a sessão. Tente novamente.");
    } finally {
      setFinishing(false);
    }
  }

  function goToResults() {
    if (sessionId) {
      router.push(`/pacientes/${patientId}/sessoes/${sessionId}`);
      router.refresh();
    }
  }

  return (
    <div className="mt-6 space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-zinc-200 bg-white p-3">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 font-medium text-zinc-700">
              <Baby size={15} />
              Câmera frontal
            </span>
            <span className="flex items-center gap-1.5 text-xs text-amber-600">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              Simulada
            </span>
          </div>
          <div className="flex aspect-video items-center justify-center rounded-lg bg-gradient-to-br from-zinc-800 to-zinc-900 text-zinc-500">
            <Baby size={40} strokeWidth={1.2} />
          </div>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-3">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 font-medium text-zinc-700">
              <Target size={15} />
              Câmera de rastreamento ocular
            </span>
            <span className="flex items-center gap-1.5 text-xs text-amber-600">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              Simulada
            </span>
          </div>
          <div className="flex aspect-video items-center justify-center rounded-lg bg-gradient-to-br from-zinc-800 to-zinc-900 text-zinc-500">
            <Target size={40} strokeWidth={1.2} />
          </div>
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <AlertTriangle size={16} className="mt-0.5 shrink-0" />
        <p>
          As câmeras acima são uma pré-visualização simulada — a integração com o hardware de
          rastreamento ainda não foi feita. A gravação já registra duração e permite salvar a
          sessão normalmente; as métricas de rastreamento serão preenchidas quando o dispositivo
          estiver conectado.
        </p>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white px-6 py-8 text-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Controle de Gravação</p>
        <div className="mt-2 flex items-center justify-center gap-2 text-4xl font-semibold tabular-nums text-zinc-900">
          {recording && <Circle size={14} className="fill-red-500 text-red-500" />}
          {formatTimer(elapsed)}
        </div>

        <div className="mt-5 flex items-center justify-center gap-3">
          <button
            onClick={() => void toggleRecording()}
            disabled={starting || finishing || finished}
            className={`flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-medium text-white disabled:opacity-60 ${
              recording ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {recording ? <Square size={15} /> : <Circle size={15} />}
            {starting ? "Iniciando sessão..." : recording ? "Parar Gravação" : finishing ? "Salvando..." : "Iniciar Gravação"}
          </button>
          <button className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 text-zinc-500 hover:bg-zinc-50">
            <Settings size={16} />
          </button>
        </div>

        <p className="mt-3 text-xs text-zinc-400">
          {recording ? "Calibração de tela bloqueada. Distância ideal: 58cm" : "Pronto para iniciar. Distância ideal: 58cm"}
        </p>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        {finished && (
          <button
            onClick={goToResults}
            className="mt-5 text-sm font-medium text-blue-600 hover:underline"
          >
            Sessão finalizada — ver resultados →
          </button>
        )}
      </div>
    </div>
  );
}
