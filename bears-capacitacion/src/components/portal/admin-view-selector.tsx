"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { ChevronDown, Search } from "lucide-react";
import { selectPortalView } from "@/app/actions/preview";

export type ViewOption = { id: string; email: string; role: "empleado" | "franquiciado" };

export function AdminViewSelector({ users, selectedId }: { users: ViewOption[]; selectedId: string | null }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const container = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const selected = users.find((user) => user.id === selectedId);
  const filtered = users.filter((user) => user.email.toLowerCase().includes(query.trim().toLowerCase()));

  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const close = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  function select(id: string | null) {
    setError(null);
    startTransition(async () => {
      const result = await selectPortalView(id);
      if (result?.error) setError(result.error);
    });
  }

  return <div ref={container} className="relative min-w-0" onKeyDown={(event) => {
    if (event.key === "Escape") { setOpen(false); container.current?.querySelector("button")?.focus(); }
  }}>
    <button type="button" disabled={pending} aria-expanded={open} aria-controls="admin-view-options" onClick={() => setOpen(!open)} className="flex h-10 max-w-64 items-center gap-2 rounded-sm border border-line bg-paper px-3 text-sm">
      <span className="truncate">{pending ? "Cambiando vista..." : selected ? selected.email : "Vista administrador"}</span><ChevronDown className="size-4 shrink-0" aria-hidden="true" />
    </button>
    {open ? <div id="admin-view-options" className="absolute right-0 top-12 z-50 w-[min(24rem,calc(100vw-2.5rem))] border border-line bg-paper p-3 shadow-lg">
      <label className="flex items-center gap-2 border border-line px-3">
        <Search className="size-4 shrink-0 text-muted" aria-hidden="true" />
        <input ref={input} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por email" aria-label="Buscar vista por email" className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none" />
      </label>
      <button type="button" disabled={pending} onClick={() => select(null)} className="mt-2 w-full rounded-sm px-3 py-3 text-left text-sm hover:bg-surface">Vista administrador{!selectedId ? " · Actual" : ""}</button>
      <div className="max-h-72 overflow-y-auto">
        {filtered.map((user) => <button type="button" key={user.id} disabled={pending} aria-current={selectedId === user.id ? "true" : undefined} onClick={() => select(user.id)} className="block w-full rounded-sm px-3 py-3 text-left hover:bg-surface">
          <span className="block break-all text-sm">{user.email}</span><span className="block text-xs text-muted">{user.role === "empleado" ? "Empleado" : "Franquiciado"}{selectedId === user.id ? " · Actual" : ""}</span>
        </button>)}
        {!filtered.length ? <p className="px-3 py-4 text-sm text-muted">No hay emails que coincidan.</p> : null}
      </div>
      {error ? <p role="alert" className="mt-2 text-sm text-alert">{error}</p> : null}
    </div> : null}
  </div>;
}
