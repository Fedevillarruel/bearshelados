"use client";

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Check, Pencil, Plus, Power, Trash2, X } from "lucide-react";
import { deleteFranchise, saveFranchise } from "@/app/actions/franchises";

export type ManagedFranchise = {
  id: string;
  name: string;
  code: string | null;
  city: string | null;
  isActive: boolean;
  employeeCount: number;
  averageProgress: number | null;
  averageScore: number | null;
};

function Dialog({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return <div className="fixed inset-0 z-30 grid place-items-center bg-ink/40 p-5" role="presentation"><section className="w-full max-w-xl border border-line bg-paper p-5 shadow-xl sm:p-6" role="dialog" aria-modal="true" aria-labelledby="franchise-dialog-title"><div className="mb-6 flex items-start justify-between gap-4"><h2 className="text-xl font-medium" id="franchise-dialog-title">{title}</h2><button className="grid size-10 place-items-center rounded-sm hover:bg-surface" type="button" onClick={onClose} aria-label="Cerrar"><X className="size-5" aria-hidden="true" /></button></div>{children}</section></div>;
}

function FranchiseForm({ franchise, onClose }: { franchise?: ManagedFranchise; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(franchise?.name ?? "");
  const [code, setCode] = useState(franchise?.code ?? "");
  const [city, setCity] = useState(franchise?.city ?? "");
  const [isActive, setIsActive] = useState(franchise?.isActive ?? true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    startTransition(async () => {
      const response = await saveFranchise({ id: franchise?.id, name, code: code.trim() || null, city: city.trim() || null, isActive });
      setSaving(false);
      if ("error" in response && response.error) {
        setError(response.error);
        return;
      }
      router.refresh();
      onClose();
    });
  }
  return <form className="grid gap-4" onSubmit={submit}><div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-2 text-sm font-medium" htmlFor="franchise-name">Nombre<input id="franchise-name" className="h-11 rounded-sm border bg-paper px-3 text-sm outline-none focus:border-jade" value={name} onChange={(event) => setName(event.target.value)} required /></label><label className="grid gap-2 text-sm font-medium" htmlFor="franchise-code">Código<input id="franchise-code" className="h-11 rounded-sm border bg-paper px-3 text-sm uppercase outline-none focus:border-jade" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} /></label></div><label className="grid gap-2 text-sm font-medium" htmlFor="franchise-city">Ciudad<input id="franchise-city" className="h-11 rounded-sm border bg-paper px-3 text-sm outline-none focus:border-jade" value={city} onChange={(event) => setCity(event.target.value)} /></label><label className="flex min-h-11 items-center gap-3 text-sm"><input className="size-4 accent-jade" type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} />Franquicia activa</label>{error ? <p className="rounded-sm bg-[#FCEAE6] px-3 py-2 text-sm text-alert" role="alert">{error}</p> : null}<div className="mt-2 flex justify-end gap-3"><button className="h-11 rounded-sm border px-4 text-sm" type="button" onClick={onClose} disabled={saving}>Cancelar</button><button className="h-11 rounded-sm bg-jade px-4 text-sm font-medium text-white disabled:opacity-60" type="submit" disabled={saving}>{saving ? "Guardando" : franchise ? "Guardar cambios" : "Crear franquicia"}</button></div></form>;
}

function percent(value: number | null) {
  return value === null ? "-" : `${Math.round(value)}%`;
}

function score(value: number | null) {
  return value === null ? "-" : value.toFixed(1);
}

export function FranchisesManager({ franchises }: { franchises: ManagedFranchise[] }) {
  const router = useRouter();
  const [editor, setEditor] = useState<"new" | ManagedFranchise | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  function toggleActive(franchise: ManagedFranchise) {
    setNotice(null);
    startTransition(async () => {
      const response = await saveFranchise({ ...franchise, isActive: !franchise.isActive });
      if ("error" in response && response.error) setNotice(response.error);
      else router.refresh();
    });
  }
  function remove(franchise: ManagedFranchise) {
    if (!window.confirm(`¿Eliminar “${franchise.name}”? Sólo se permite cuando no tiene usuarios asignados.`)) return;
    setNotice(null);
    startTransition(async () => {
      const response = await deleteFranchise(franchise.id);
      if ("error" in response && response.error) setNotice(response.error);
      else router.refresh();
    });
  }
  return <><header className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm text-muted">Red de locales</p><h1 className="mt-2 text-[31px] font-medium leading-tight">Franquicias</h1><p className="mt-2 text-sm text-muted">Cobertura, equipo y desempeño por operación.</p></div><button className="inline-flex h-10 items-center gap-2 rounded-sm bg-jade px-4 text-sm font-medium text-white hover:bg-jade-deep" type="button" onClick={() => setEditor("new")}><Plus className="size-4" aria-hidden="true" />Nueva franquicia</button></header>{notice ? <p className="mt-5 rounded-sm bg-[#FCEAE6] px-3 py-2 text-sm text-alert" role="alert">{notice}</p> : null}<section className="mt-8 grid gap-5 lg:grid-cols-2">{franchises.map((franchise) => <article className="border border-line bg-paper p-5" key={franchise.id}><div className="flex items-center justify-between gap-4"><div className="grid size-10 place-items-center bg-surface"><Building2 className="size-5 text-jade-deep" aria-hidden="true" /></div><span className={`inline-flex rounded-sm px-2 py-1 text-xs font-medium ${franchise.isActive ? "bg-[#E0F1EB] text-jade-deep" : "bg-[#FCEAE6] text-alert"}`}>{franchise.isActive ? "Activa" : "Inactiva"}</span></div><h2 className="mt-8 text-xl font-medium">{franchise.name}</h2><p className="mt-2 text-sm text-muted">{[franchise.city, franchise.code].filter(Boolean).join(" · ") || "Sin ubicación ni código"}</p><div className="mt-8 grid grid-cols-3 border-y border-line py-4"><div><p className="text-xs text-muted">Equipo</p><p className="mt-2 font-tabular text-xl font-medium">{franchise.employeeCount}</p><p className="mt-1 text-xs text-muted">Personas</p></div><div className="border-x border-line px-4"><p className="text-xs text-muted">Progreso</p><p className="mt-2 font-tabular text-xl font-medium">{percent(franchise.averageProgress)}</p><p className="mt-1 text-xs text-muted">Promedio</p></div><div className="pl-4"><p className="text-xs text-muted">Nota</p><p className="mt-2 font-tabular text-xl font-medium">{score(franchise.averageScore)}</p><p className="mt-1 text-xs text-muted">Promedio</p></div></div><div className="mt-5 flex flex-wrap gap-2"><button className="inline-flex h-10 items-center gap-2 rounded-sm border px-3 text-sm font-medium hover:bg-surface" type="button" onClick={() => setEditor(franchise)}><Pencil className="size-4" aria-hidden="true" />Editar</button><button className="grid size-10 place-items-center rounded-sm border hover:bg-surface" type="button" aria-label={franchise.isActive ? `Desactivar ${franchise.name}` : `Activar ${franchise.name}`} title={franchise.isActive ? "Desactivar" : "Activar"} onClick={() => toggleActive(franchise)}>{franchise.isActive ? <Power className="size-4" aria-hidden="true" /> : <Check className="size-4" aria-hidden="true" />}</button><button className="grid size-10 place-items-center rounded-sm border text-alert hover:bg-[#FCEAE6]" type="button" aria-label={`Eliminar ${franchise.name}`} title="Eliminar" onClick={() => remove(franchise)}><Trash2 className="size-4" aria-hidden="true" /></button></div></article>)}{!franchises.length ? <section className="border border-dashed border-line bg-surface p-8 lg:col-span-2"><Building2 className="size-6 text-jade" aria-hidden="true" /><h2 className="mt-5 text-lg font-medium">Todavía no hay franquicias</h2><p className="mt-2 text-sm text-muted">Creá la primera franquicia para poder asignar equipo y responsables.</p></section> : null}</section>{editor ? <Dialog title={editor === "new" ? "Nueva franquicia" : "Editar franquicia"} onClose={() => setEditor(null)}><FranchiseForm key={editor === "new" ? "new" : editor.id} franchise={editor === "new" ? undefined : editor} onClose={() => setEditor(null)} /></Dialog> : null}</>;
}