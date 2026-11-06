"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { AlertTriangle, Trash2 } from "lucide-react";

export default function DeleteButton({
  url,
  confirmMessage,
  confirmTitle,
  redirectTo,
  label,
  iconOnly,
}: {
  url: string;
  confirmMessage: string;
  confirmTitle?: string;
  redirectTo?: string;
  label?: string;
  iconOnly?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(false);

  async function handleConfirm() {
    setDeleting(true);
    setError(false);
    const res = await fetch(url, { method: "DELETE" });
    if (!res.ok) {
      setDeleting(false);
      setError(true);
      return;
    }
    setOpen(false);
    if (redirectTo) {
      router.push(redirectTo);
    }
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(false);
          setOpen(true);
        }}
        title="Excluir"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-red-600 hover:underline"
      >
        <Trash2 size={14} />
        {!iconOnly && (label ?? "Excluir")}
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center whitespace-normal bg-black/40 px-4">
            <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-lg">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600">
                  <AlertTriangle size={18} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-zinc-900">{confirmTitle ?? "Confirmar exclusão"}</h3>
                  <p className="mt-1 text-sm text-zinc-500">{confirmMessage}</p>
                  {error && (
                    <p className="mt-2 text-sm font-medium text-red-600">
                      Não foi possível excluir. Tente novamente.
                    </p>
                  )}
                </div>
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={deleting}
                  className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-60"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={deleting}
                  className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
                >
                  {deleting ? "Excluindo..." : "Excluir"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
