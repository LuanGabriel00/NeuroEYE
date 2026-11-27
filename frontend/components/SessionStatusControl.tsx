"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SessionStatus } from "@/lib/types";

const options: { value: SessionStatus; label: string }[] = [
  { value: "CONCLUIDA", label: "Concluída" },
  { value: "EM_ANALISE", label: "Em Análise" },
  { value: "SINALIZADA", label: "Sinalizada" },
];

export default function SessionStatusControl({
  sessionId,
  status,
}: {
  sessionId: string;
  status: SessionStatus;
}) {
  const router = useRouter();
  const [value, setValue] = useState(status);
  const [saving, setSaving] = useState(false);

  async function handleChange(next: SessionStatus) {
    setValue(next);
    setSaving(true);
    const res = await fetch(`/api/sessions/${sessionId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    setSaving(false);
    if (res.ok) router.refresh();
  }

  return (
    <select
      value={value}
      disabled={saving}
      onChange={(e) => handleChange(e.target.value as SessionStatus)}
      className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-600 focus:border-blue-500 focus:outline-none disabled:opacity-60"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
