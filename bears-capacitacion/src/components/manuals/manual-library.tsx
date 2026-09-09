"use client";

import { startTransition, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, ExternalLink, FileText, FolderPlus, Pencil, Plus, Trash2, Upload, X } from "lucide-react";
import { createManualUploadUrl, deleteManual, deleteManualCategory, saveManual, saveManualCategory } from "@/app/actions/manuals";
import { uploadPrivateFile } from "@/lib/supabase/resumable-upload";

type ManualRole = "admin" | "franquiciado";

export type ManualCategory = { id: string; name: string; orderIndex: number };
export type ManualRecord = {
  id: string;
  title: string;
  description: string | null;
  categoryId: string | null;
  categoryName: string | null;
  fileUrl: string;
  storagePath: string | null;
  fileType: string | null;
  sizeBytes: number | null;
  version: number;
  visibleTo: ManualRole[];
  createdAt: string;
  downloadCount?: number;
};

function Dialog({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return <div className="fixed inset-0 z-30 grid place-items-center bg-ink/40 p-5" role="presentation"><section className="max-h-[90vh] w-full max-w-2xl overflow-y-auto border border-line bg-paper p-5 shadow-xl sm:p-6" role="dialog" aria-modal="true" aria-labelledby="manual-dialog-title"><div className="mb-6 flex items-start justify-between gap-4"><h2 className="text-xl font-medium" id="manual-dialog-title">{title}</h2><button className="grid size-10 place-items-center rounded-sm hover:bg-surface" type="button" aria-label="Cerrar" onClick={onClose}><X className="size-5" aria-hidden="true" /></button></div>{children}</section></div>;
}

function formatSize(sizeBytes: number | null) {
  if (!sizeBytes) return null;
  return sizeBytes >= 1024 * 1024 ? `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.ceil(sizeBytes / 1024)} KB`;
}

function formatDocumentType(fileType: string | null) {
  if (fileType === "application/pdf") return "PDF";
  if (fileType?.includes("word")) return "DOCX";
  if (fileType?.includes("spreadsheet")) return "XLSX";
  return "Documento";
}

function ManualForm({ manual, categories, onClose }: { manual?: ManualRecord; categories: ManualCategory[]; onClose: () => void }) {
  const router = useRouter();
  const [title, setTitle] = useState(manual?.title ?? "");
  const [description, setDescription] = useState(manual?.description ?? "");
  const [categoryId, setCategoryId] = useState(manual?.categoryId ?? "");
  const [version, setVersion] = useState(String(manual?.version ?? 1));
  const [fileUrl, setFileUrl] = useState(manual?.storagePath ? "" : manual?.fileUrl ?? "");
  const [storagePath, setStoragePath] = useState<string | null>(manual?.storagePath ?? null);
  const [file, setFile] = useState<File | null>(null);
  const [visibleTo, setVisibleTo] = useState<ManualRole[]>(manual?.visibleTo ?? ["admin", "franquiciado"]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function toggleRole(role: ManualRole) {
    setVisibleTo((current) => current.includes(role) ? current.filter((item) => item !== role) : [...current, role]);
  }

  async function upload(selectedFile: File) {
    const uploadUrl = await createManualUploadUrl({ fileName: selectedFile.name, contentType: selectedFile.type, fileSize: selectedFile.size });
    if ("error" in uploadUrl && uploadUrl.error) return { error: uploadUrl.error };
    if (!("data" in uploadUrl) || !uploadUrl.data) return { error: "No pudimos preparar la subida." };
    try {
      await uploadPrivateFile({ bucket: "manuals", path: uploadUrl.data.path, token: uploadUrl.data.token, file: selectedFile, contentType: selectedFile.type });
      return { data: uploadUrl.data.path };
    } catch (error) {
      return { error: error instanceof Error ? error.message : "No pudimos subir el archivo." };
    }
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    startTransition(async () => {
      let nextStoragePath = storagePath;
      if (file) {
        const result = await upload(file);
        if ("error" in result && result.error) {
          setError(result.error);
          setSaving(false);
          return;
        }
        nextStoragePath = "data" in result ? result.data ?? null : null;
      }
      const response = await saveManual({
        id: manual?.id,
        title,
        description: description.trim() || null,
        categoryId: categoryId || null,
        visibleTo,
        fileUrl: nextStoragePath ? "" : fileUrl,
        storagePath: nextStoragePath,
        fileType: file?.type ?? manual?.fileType ?? null,
        sizeBytes: file?.size ?? manual?.sizeBytes ?? null,
        version: Number(version),
      });
      setSaving(false);
      if ("error" in response && response.error) {
        setError(response.error);
        return;
      }
      router.refresh();
      onClose();
    });
  }

  return <form className="grid gap-4" onSubmit={submit}><label className="grid gap-2 text-sm font-medium" htmlFor="manual-title">Título<input id="manual-title" className="h-11 rounded-sm border bg-paper px-3 text-sm outline-none focus:border-jade" value={title} onChange={(event) => setTitle(event.target.value)} required /></label><label className="grid gap-2 text-sm font-medium" htmlFor="manual-description">Descripción<input id="manual-description" className="h-11 rounded-sm border bg-paper px-3 text-sm outline-none focus:border-jade" value={description} onChange={(event) => setDescription(event.target.value)} /></label><div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-2 text-sm font-medium" htmlFor="manual-category">Categoría<select id="manual-category" className="h-11 rounded-sm border bg-paper px-3 text-sm" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}><option value="">Sin categoría</option>{categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label><label className="grid gap-2 text-sm font-medium" htmlFor="manual-version">Versión<input id="manual-version" className="h-11 rounded-sm border bg-paper px-3 text-sm outline-none focus:border-jade" type="number" min="1" value={version} onChange={(event) => setVersion(event.target.value)} required /></label></div><fieldset><legend className="text-sm font-medium">Visible para</legend><div className="mt-2 flex flex-wrap gap-4"><label className="flex min-h-10 items-center gap-2 text-sm"><input className="size-4 accent-jade" type="checkbox" checked={visibleTo.includes("admin")} onChange={() => toggleRole("admin")} />Administración</label><label className="flex min-h-10 items-center gap-2 text-sm"><input className="size-4 accent-jade" type="checkbox" checked={visibleTo.includes("franquiciado")} onChange={() => toggleRole("franquiciado")} />Franquiciados</label></div></fieldset><div className="border border-dashed border-line p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-medium">Archivo privado</p><p className="mt-1 text-xs text-muted">PDF, DOCX o XLSX. La carga se reanuda si la conexión se interrumpe.</p></div>{storagePath ? <button className="h-8 rounded-sm border px-3 text-xs" type="button" onClick={() => setStoragePath(null)}>Quitar archivo</button> : null}</div><label className="mt-4 inline-flex h-10 cursor-pointer items-center gap-2 rounded-sm border px-3 text-sm font-medium hover:bg-surface"><Upload className="size-4" aria-hidden="true" />Elegir archivo<input className="sr-only" type="file" accept="application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label>{file ? <p className="mt-2 text-xs text-muted">{file.name} · {formatSize(file.size)}</p> : storagePath ? <p className="mt-2 text-xs text-muted">Se conserva el archivo privado actual.</p> : null}</div><label className="grid gap-2 text-sm font-medium" htmlFor="manual-url">URL HTTPS externa (alternativa)<input id="manual-url" className="h-11 rounded-sm border bg-paper px-3 text-sm outline-none focus:border-jade" type="url" placeholder="https://" value={fileUrl} onChange={(event) => { setFileUrl(event.target.value); if (event.target.value) setStoragePath(null); }} required={!storagePath && !file} /></label>{error ? <p className="rounded-sm bg-[#FCEAE6] px-3 py-2 text-sm text-alert" role="alert">{error}</p> : null}<div className="mt-2 flex justify-end gap-3"><button className="h-11 rounded-sm border px-4 text-sm" type="button" onClick={onClose} disabled={saving}>Cancelar</button><button className="h-11 rounded-sm bg-jade px-4 text-sm font-medium text-white disabled:opacity-60" type="submit" disabled={saving}>{saving ? "Guardando" : manual ? "Guardar cambios" : "Publicar manual"}</button></div></form>;
}

function CategoryForm({ category, nextOrderIndex, onClose }: { category?: ManualCategory; nextOrderIndex: number; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(category?.name ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    startTransition(async () => {
      const response = await saveManualCategory({ id: category?.id, name, orderIndex: category?.orderIndex ?? nextOrderIndex });
      setSaving(false);
      if ("error" in response && response.error) setError(response.error);
      else { router.refresh(); onClose(); }
    });
  }
  return <form className="grid gap-4" onSubmit={submit}><label className="grid gap-2 text-sm font-medium" htmlFor="category-name">Nombre<input id="category-name" className="h-11 rounded-sm border bg-paper px-3 text-sm outline-none focus:border-jade" value={name} onChange={(event) => setName(event.target.value)} required /></label>{error ? <p className="rounded-sm bg-[#FCEAE6] px-3 py-2 text-sm text-alert" role="alert">{error}</p> : null}<div className="mt-2 flex justify-end gap-3"><button className="h-11 rounded-sm border px-4 text-sm" type="button" onClick={onClose} disabled={saving}>Cancelar</button><button className="h-11 rounded-sm bg-jade px-4 text-sm font-medium text-white disabled:opacity-60" type="submit" disabled={saving}>Guardar categoría</button></div></form>;
}

export function AdminManualsManager({ manuals, categories }: { manuals: ManualRecord[]; categories: ManualCategory[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [manualEditor, setManualEditor] = useState<"new" | ManualRecord | null>(null);
  const [categoryEditor, setCategoryEditor] = useState<"new" | ManualCategory | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const visibleManuals = useMemo(() => manuals.filter((manual) => `${manual.title} ${manual.description ?? ""} ${manual.categoryName ?? ""}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())), [manuals, query]);

  function removeManual(manual: ManualRecord) {
    if (!window.confirm(`¿Eliminar “${manual.title}”? Esta acción también elimina su archivo privado.`)) return;
    setNotice(null);
    startTransition(async () => { const response = await deleteManual(manual.id); if ("error" in response && response.error) setNotice(response.error); else router.refresh(); });
  }

  function removeCategory(category: ManualCategory) {
    if (!window.confirm(`¿Eliminar la categoría “${category.name}”? Los manuales se conservarán sin categoría.`)) return;
    setNotice(null);
    startTransition(async () => { const response = await deleteManualCategory(category.id); if ("error" in response && response.error) setNotice(response.error); else router.refresh(); });
  }

  return <><header className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm text-muted">Documentación operativa</p><h1 className="mt-2 text-[31px] font-medium leading-tight">Manuales e instructivos</h1><p className="mt-2 text-sm text-muted">Archivos privados, versiones y visibilidad por rol.</p></div><div className="flex flex-wrap gap-3"><button className="inline-flex h-10 items-center gap-2 rounded-sm border px-3 text-sm font-medium hover:bg-surface" type="button" onClick={() => setCategoryEditor("new")}><FolderPlus className="size-4" aria-hidden="true" />Categoría</button><button className="inline-flex h-10 items-center gap-2 rounded-sm bg-jade px-4 text-sm font-medium text-white hover:bg-jade-deep" type="button" onClick={() => setManualEditor("new")}><Plus className="size-4" aria-hidden="true" />Subir manual</button></div></header>{notice ? <p className="mt-5 rounded-sm bg-[#FCEAE6] px-3 py-2 text-sm text-alert" role="alert">{notice}</p> : null}<div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_260px]"><section><input className="h-11 w-full rounded-sm border bg-paper px-3 text-sm outline-none focus:border-jade" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por título, descripción o categoría" aria-label="Buscar manuales" /><div className="mt-5 divide-y divide-line border border-line bg-paper">{visibleManuals.map((manual) => <article className="flex flex-wrap items-center justify-between gap-4 p-5" key={manual.id}><div className="flex min-w-0 items-start gap-4"><FileText className="mt-0.5 size-5 shrink-0 text-jade" aria-hidden="true" /><div className="min-w-0"><p className="text-xs text-muted">{manual.categoryName ?? "Sin categoría"}</p><h2 className="mt-1 truncate font-medium">{manual.title}</h2><p className="mt-1 text-sm text-muted">{formatDocumentType(manual.fileType)} · v{manual.version}{formatSize(manual.sizeBytes) ? ` · ${formatSize(manual.sizeBytes)}` : ""} · {manual.visibleTo.includes("franquiciado") ? "Franquiciados" : "Sólo administración"}</p>{manual.description ? <p className="mt-2 max-w-2xl text-sm text-muted">{manual.description}</p> : null}</div></div><div className="flex items-center gap-1"><a className="grid size-9 place-items-center rounded-sm border hover:bg-surface" href={manual.storagePath ? `/api/manuals/${manual.id}/download` : manual.fileUrl} target="_blank" rel="noreferrer" aria-label={`Abrir ${manual.title}`} title="Abrir documento"><ExternalLink className="size-4" aria-hidden="true" /></a><button className="grid size-9 place-items-center rounded-sm border hover:bg-surface" type="button" aria-label={`Editar ${manual.title}`} title="Editar manual" onClick={() => setManualEditor(manual)}><Pencil className="size-4" aria-hidden="true" /></button><button className="grid size-9 place-items-center rounded-sm border text-alert hover:bg-[#FCEAE6]" type="button" aria-label={`Eliminar ${manual.title}`} title="Eliminar manual" onClick={() => removeManual(manual)}><Trash2 className="size-4" aria-hidden="true" /></button></div></article>)}{!visibleManuals.length ? <p className="p-6 text-sm text-muted">No hay manuales que coincidan con la búsqueda.</p> : null}</div></section><aside className="border border-line bg-surface p-5"><div className="flex items-center justify-between gap-3"><h2 className="font-medium">Categorías</h2><span className="font-tabular text-xs text-muted">{categories.length}</span></div><div className="mt-4 divide-y divide-line border-y border-line">{categories.map((category) => <div className="flex items-center justify-between gap-2 py-3" key={category.id}><span className="min-w-0 truncate text-sm">{category.name}</span><span className="flex shrink-0 gap-1"><button className="grid size-8 place-items-center hover:bg-paper" type="button" aria-label={`Editar ${category.name}`} title="Editar categoría" onClick={() => setCategoryEditor(category)}><Pencil className="size-3.5" aria-hidden="true" /></button><button className="grid size-8 place-items-center text-alert hover:bg-[#FCEAE6]" type="button" aria-label={`Eliminar ${category.name}`} title="Eliminar categoría" onClick={() => removeCategory(category)}><X className="size-4" aria-hidden="true" /></button></span></div>)}{!categories.length ? <p className="py-3 text-sm text-muted">Creá categorías para ordenar la biblioteca.</p> : null}</div></aside></div>{manualEditor ? <Dialog title={manualEditor === "new" ? "Subir manual" : "Editar manual"} onClose={() => setManualEditor(null)}><ManualForm key={manualEditor === "new" ? "new" : manualEditor.id} manual={manualEditor === "new" ? undefined : manualEditor} categories={categories} onClose={() => setManualEditor(null)} /></Dialog> : null}{categoryEditor ? <Dialog title={categoryEditor === "new" ? "Nueva categoría" : "Editar categoría"} onClose={() => setCategoryEditor(null)}><CategoryForm key={categoryEditor === "new" ? "new" : categoryEditor.id} category={categoryEditor === "new" ? undefined : categoryEditor} nextOrderIndex={Math.max(0, ...categories.map((category) => category.orderIndex)) + 1} onClose={() => setCategoryEditor(null)} /></Dialog> : null}</>;
}

export function ManualLibrary({ manuals, heading = "Manuales e instructivos", description = "Documentación vigente para la operación." }: { manuals: ManualRecord[]; heading?: string; description?: string }) {
  const [query, setQuery] = useState("");
  const visibleManuals = useMemo(() => manuals.filter((manual) => `${manual.title} ${manual.description ?? ""} ${manual.categoryName ?? ""}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())), [manuals, query]);
  return <><header><h1 className="text-[31px] font-medium leading-tight">{heading}</h1><p className="mt-2 text-sm text-muted">{description}</p></header><input className="mt-8 h-11 w-full rounded-sm border bg-paper px-3 text-sm outline-none focus:border-jade" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar manuales" aria-label="Buscar manuales" /><section className="mt-5 grid gap-px border border-line bg-line sm:grid-cols-2">{visibleManuals.map((manual) => <article className="flex min-h-64 flex-col bg-paper p-5" key={manual.id}><FileText className="size-5 text-jade" aria-hidden="true" /><p className="mt-8 text-xs text-muted">{manual.categoryName ?? "Documentación"}</p><h2 className="mt-1 font-medium">{manual.title}</h2><p className="mt-2 text-sm leading-6 text-muted">{manual.description ?? `${formatDocumentType(manual.fileType)}, versión ${manual.version}.`}</p><div className="mt-auto flex items-center justify-between gap-3 pt-6"><span className="text-xs text-muted">v{manual.version}{formatSize(manual.sizeBytes) ? ` · ${formatSize(manual.sizeBytes)}` : ""}</span><a className="inline-flex h-10 items-center gap-2 rounded-sm border px-3 text-sm font-medium hover:bg-surface" href={manual.storagePath ? `/api/manuals/${manual.id}/download` : manual.fileUrl} target="_blank" rel="noreferrer"><Download className="size-4" aria-hidden="true" />Abrir</a></div></article>)}{!visibleManuals.length ? <div className="bg-paper p-6 text-sm text-muted sm:col-span-2">No hay manuales disponibles para tu perfil.</div> : null}</section></>;
}