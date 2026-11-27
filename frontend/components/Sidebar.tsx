"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Activity, BarChart3, LogOut, Settings, Users } from "lucide-react";
import type { SessionPayload } from "@/lib/auth";

const navItems = [
  { href: "/pacientes", label: "Pacientes", icon: Users },
  { href: "/sessoes", label: "Sessões", icon: Activity },
  { href: "/resultados", label: "Resultados", icon: BarChart3 },
  { href: "/configuracoes", label: "Configurações", icon: Settings },
];

export default function Sidebar({ doctor }: { doctor: SessionPayload }) {
  const pathname = usePathname();
  const router = useRouter();

  const initials = doctor.name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("");

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col border-r border-zinc-200 bg-white">
      <div className="flex items-center gap-2 px-5 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white">
          <Activity size={18} />
        </div>
        <span className="text-lg font-semibold text-zinc-900">NeuroTrack</span>
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-3 py-2">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? "bg-blue-50 text-blue-700"
                  : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
              }`}
            >
              <Icon size={18} />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="flex items-center gap-3 border-t border-zinc-200 px-5 py-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-sm font-semibold text-zinc-600">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-zinc-900">{doctor.name}</p>
          <p className="truncate text-xs text-zinc-500">{doctor.role}</p>
        </div>
        <button
          onClick={handleLogout}
          title="Sair"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
        >
          <LogOut size={16} />
        </button>
      </div>
    </aside>
  );
}
