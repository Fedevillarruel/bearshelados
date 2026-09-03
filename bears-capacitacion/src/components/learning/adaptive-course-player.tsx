"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  ImageIcon,
  Link2,
  PlayCircle,
  Video,
} from "lucide-react";
import { useVideoTracking } from "@/hooks/use-video-tracking";
import type { EmployeeAsset, EmployeeCourseModule } from "@/lib/platform/employee";

type PlayerResource = {
  asset: EmployeeAsset;
  scope: "module" | "course";
};

function formatMinutes(seconds: number) {
  return `${Math.max(1, Math.ceil(seconds / 60))} min`;
}

function formatFileSize(sizeBytes: number | null) {
  if (!sizeBytes) return "Archivo";
  if (sizeBytes < 1024 * 1024) return `${Math.max(1, Math.round(sizeBytes / 1024))} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function contentText(value: string) {
  return value.replace(/<\/?p>/gi, "\n").replace(/<[^>]*>/g, "").trim();
}

function resourceLabel(type: EmployeeAsset["type"]) {
  const labels: Record<EmployeeAsset["type"], string> = {
    video: "Video",
    pdf: "PDF",
    image: "Imagen",
    spreadsheet: "Planilla",
    document: "Documento",
    text: "Texto",
    link: "Enlace",
  };
  return labels[type];
}

function resourceIcon(type: EmployeeAsset["type"]) {
  if (type === "video") return Video;
  if (type === "pdf" || type === "document") return FileText;
  if (type === "image") return ImageIcon;
  if (type === "spreadsheet") return FileSpreadsheet;
  if (type === "link") return Link2;
  return BookOpen;
}

function videoMimeType(url: string) {
  return url.split("?")[0]?.toLowerCase().endsWith(".webm") ? "video/webm" : "video/mp4";
}

function canPreviewPdf(url: string) {
  try {
    const hostname = new URL(url).hostname;
    return hostname === "qrkiddqyffiaswriwxzy.supabase.co" || hostname === "www.w3.org";
  } catch {
    return false;
  }
}

function TrackedVideo({ asset, onCompleted }: { asset: EmployeeAsset; onCompleted: () => void }) {
  const { videoRef } = useVideoTracking({
    assetId: asset.id,
    durationSeconds: asset.duration_seconds,
    initialPosition: asset.progress?.last_position ?? 0,
    initialRanges: asset.progress?.watched_ranges ?? [],
    initiallyCompleted: asset.isCompleted,
    onCompleted,
  });

  return (
    <section className="overflow-hidden bg-ink">
      <video ref={videoRef} className="aspect-video w-full" controls preload="metadata" onLoadedMetadata={() => { if (videoRef.current && asset.progress?.last_position) videoRef.current.currentTime = asset.progress.last_position; }}>
        <source src={asset.url} type={videoMimeType(asset.url)} />
        Tu navegador no puede reproducir este video.
      </video>
      <div className="flex items-center justify-between gap-4 border-t border-white/15 px-4 py-3 text-sm text-white/80">
        <span className="flex min-w-0 items-center gap-2"><PlayCircle className="size-4 shrink-0" aria-hidden="true" /><span className="truncate">{asset.title}</span></span>
        <span className="font-tabular shrink-0">{asset.isCompleted ? "Completado" : formatMinutes(asset.duration_seconds)}</span>
      </div>
    </section>
  );
}

function ResourceProgressRecorder({ asset, onRecorded }: { asset: EmployeeAsset | undefined; onRecorded: () => void }) {
  const reportedAssetIds = useRef(new Set<string>());

  useEffect(() => {
    if (!asset || asset.type === "video" || asset.isCompleted || reportedAssetIds.current.has(asset.id)) return;
    reportedAssetIds.current.add(asset.id);
    void fetch("/api/resource-progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assetId: asset.id }),
    }).then((response) => {
      if (!response.ok) {
        reportedAssetIds.current.delete(asset.id);
        return;
      }
      onRecorded();
    }).catch(() => {
      reportedAssetIds.current.delete(asset.id);
    });
  }, [asset, onRecorded]);

  return null;
}

function DownloadResource({ asset, label }: { asset: EmployeeAsset; label: string }) {
  const Icon = resourceIcon(asset.type);
  return (
    <section className="border border-line bg-surface p-5 sm:p-6">
      <span className="grid size-11 place-items-center bg-paper text-jade-deep"><Icon className="size-5" aria-hidden="true" /></span>
      <p className="mt-6 font-tabular text-xs text-muted">{label.toUpperCase()}</p>
      <h3 className="mt-2 text-xl font-medium">{asset.title}</h3>
      {asset.description ? <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">{asset.description}</p> : null}
      <a className="mt-6 inline-flex h-11 items-center gap-2 rounded-sm bg-jade px-4 text-sm font-medium text-white transition-colors hover:bg-jade-deep" href={asset.url} target="_blank" rel="noreferrer"><Download className="size-4" aria-hidden="true" />Abrir archivo</a>
    </section>
  );
}

function AssetStage({ asset, onAssetCompleted }: { asset: EmployeeAsset; onAssetCompleted: () => void }) {
  if (asset.type === "video") return <TrackedVideo asset={asset} onCompleted={onAssetCompleted} />;
  if (asset.type === "pdf") {
    if (!canPreviewPdf(asset.url)) return <DownloadResource asset={asset} label="PDF" />;
    return (
      <section className="overflow-hidden border border-line">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface px-4 py-3">
          <span className="flex min-w-0 items-center gap-2 text-sm font-medium"><FileText className="size-4 shrink-0 text-jade-deep" aria-hidden="true" /><span className="truncate">{asset.title}</span></span>
          <a className="inline-flex h-8 items-center gap-2 rounded-sm border bg-paper px-3 text-xs font-medium transition-colors hover:bg-surface" href={asset.url} target="_blank" rel="noreferrer"><ExternalLink className="size-3.5" aria-hidden="true" />Abrir</a>
        </header>
        <iframe className="h-[68vh] min-h-96 w-full bg-paper" src={asset.url} title={asset.title}>Tu navegador no permite previsualizar este documento.</iframe>
      </section>
    );
  }
  if (asset.type === "image") {
    return <figure className="overflow-hidden border border-line bg-surface"><Image className="max-h-[70vh] w-full object-contain" src={asset.url} alt={asset.description ?? asset.title} width={1440} height={810} sizes="(max-width: 1280px) 100vw, 900px" /><figcaption className="flex items-center gap-2 border-t border-line bg-paper px-4 py-3 text-sm text-muted"><ImageIcon className="size-4 shrink-0" aria-hidden="true" />{asset.title}</figcaption></figure>;
  }
  if (asset.type === "spreadsheet") return <DownloadResource asset={asset} label={`Planilla · ${formatFileSize(asset.size_bytes)}`} />;
  if (asset.type === "document") return <DownloadResource asset={asset} label={`Documento · ${formatFileSize(asset.size_bytes)}`} />;
  if (asset.type === "link") return <a className="flex min-h-20 items-center justify-between gap-4 border border-line px-5 py-4 text-sm font-medium text-jade-deep transition-colors hover:bg-surface" href={asset.url} target="_blank" rel="noreferrer"><span className="flex min-w-0 items-center gap-3"><Link2 className="size-5 shrink-0" aria-hidden="true" /><span className="truncate">{asset.title}</span></span><ExternalLink className="size-4 shrink-0" aria-hidden="true" /></a>;
  return <article className="border border-line bg-paper p-5 sm:p-6"><h3 className="text-xl font-medium">{asset.title}</h3>{asset.description ? <p className="mt-3 text-sm leading-6 text-muted">{asset.description}</p> : null}<p className="mt-5 whitespace-pre-line text-base leading-8">{contentText(asset.url)}</p></article>;
}

function ResourceList({ resources, selectedAssetId, onSelect }: { resources: PlayerResource[]; selectedAssetId: string | null; onSelect: (assetId: string) => void }) {
  return (
    <ol className="divide-y divide-line border-y border-line" aria-label="Contenido de la lección">
      {resources.map(({ asset, scope }) => {
        const Icon = resourceIcon(asset.type);
        const active = asset.id === selectedAssetId;
        return <li key={asset.id}><button className={`flex min-h-16 w-full items-center gap-3 px-3 py-3 text-left transition-colors ${active ? "bg-sand-soft" : "hover:bg-surface"}`} type="button" onClick={() => onSelect(asset.id)} aria-current={active ? "true" : undefined}><span className={`grid size-8 shrink-0 place-items-center ${active ? "bg-jade text-white" : "bg-surface text-jade-deep"}`}><Icon className="size-4" aria-hidden="true" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{asset.title}</span><span className="mt-1 block text-xs text-muted">{asset.is_primary ? "Video principal" : scope === "course" ? "Recurso del curso" : resourceLabel(asset.type)}{asset.type === "video" ? ` · ${formatMinutes(asset.duration_seconds)}` : ""}</span></span>{asset.isCompleted ? <CheckCircle2 className="size-4 shrink-0 text-jade" aria-label="Contenido visto" /> : null}</button></li>;
      })}
    </ol>
  );
}

function ModuleList({ modules, currentModuleId, coursePath, completedModuleIds }: { modules: EmployeeCourseModule["modules"]; currentModuleId: string; coursePath: string; completedModuleIds: string[] }) {
  const completed = new Set(completedModuleIds);

  return (
    <ol className="mt-6 space-y-1" aria-label="Módulos del curso">
      {modules.map((module, index) => {
        const active = module.id === currentModuleId;
        const isCompleted = completed.has(module.id);
        return (
          <li key={module.id}>
            <Link href={`${coursePath}/${module.id}`} className={`flex min-h-11 items-center gap-3 px-2 text-left text-sm transition-colors ${active ? "bg-surface font-medium" : "text-muted hover:bg-surface hover:text-ink"}`} aria-current={active ? "page" : undefined}>
              <span className="font-tabular text-xs">{String(index + 1).padStart(2, "0")}</span>
              <span className="min-w-0 flex-1 truncate">{module.title}</span>
              {isCompleted ? <CheckCircle2 className="size-4 shrink-0 text-jade" aria-label="Módulo completado" /> : null}
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

export function AdaptiveCoursePlayer({ data }: { data: EmployeeCourseModule }) {
  const router = useRouter();
  const moduleNumber = data.modules.findIndex((module) => module.id === data.currentModule.id) + 1;
  const coursePath = `/cursos/${data.course.slug}/modulos`;
  const resources: PlayerResource[] = [
    ...data.assets.map((asset) => ({ asset, scope: "module" as const })),
    ...data.courseAssets.map((asset) => ({ asset, scope: "course" as const })),
  ];
  const firstResourceId = resources.find(({ asset }) => asset.is_primary)?.asset.id ?? resources.find(({ asset }) => asset.type === "video")?.asset.id ?? resources[0]?.asset.id ?? null;
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(firstResourceId);
  const selectedAsset = resources.find(({ asset }) => asset.id === selectedAssetId)?.asset ?? resources[0]?.asset;
  const visibleExams = [...data.exams, ...data.courseExams];

  useEffect(() => {
    setSelectedAssetId(firstResourceId);
  }, [data.currentModule.id, firstResourceId]);

  function refreshProgress() {
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-surface xl:grid xl:grid-cols-[260px_minmax(0,1fr)_320px]">
      <aside className="border-b border-line bg-paper p-5 xl:min-h-screen xl:border-b-0 xl:border-r">
        <Link href="/cursos/mis-cursos" className="text-sm text-muted transition-colors hover:text-ink">Mis cursos</Link>
        <h1 className="mt-5 text-xl font-medium">{data.course.title}</h1>
        <p className="mt-2 text-sm leading-6 text-muted">{data.course.summary ?? data.course.description}</p>
        <div className="mt-6 border-y border-line py-4"><div className="flex items-center justify-between gap-3 text-sm"><span className="text-muted">Progreso del curso</span><span className="font-tabular font-medium">{Math.round(Number(data.enrollment.progress_percent))}%</span></div><div className="mt-3 h-1.5 overflow-hidden bg-surface"><div className="h-full bg-jade transition-[width]" style={{ width: `${Math.min(100, Math.max(0, Number(data.enrollment.progress_percent)))}%` }} /></div></div>
        <ModuleList modules={data.modules} currentModuleId={data.currentModule.id} coursePath={coursePath} completedModuleIds={data.completedModuleIds} />
      </aside>

      <main className="min-w-0 bg-paper">
        <div className="mx-auto w-full max-w-5xl px-5 py-8 sm:px-8 lg:px-12">
          <p className="font-tabular text-sm text-muted">MÓDULO {String(moduleNumber).padStart(2, "0")}</p>
          <h2 className="mt-2 text-[31px] font-medium leading-tight">{data.currentModule.title}</h2>
          {data.currentModule.description ? <p className="mt-3 max-w-3xl text-sm leading-6 text-muted">{data.currentModule.description}</p> : null}
          {selectedAsset ? <div className="mt-8"><AssetStage asset={selectedAsset} key={selectedAsset.id} onAssetCompleted={refreshProgress} /></div> : <section className="mt-8 border border-dashed border-line bg-surface p-6"><BookOpen className="size-5 text-jade" aria-hidden="true" /><p className="mt-4 text-sm text-muted">Este módulo todavía no tiene contenido publicado.</p></section>}
          <ResourceProgressRecorder asset={selectedAsset} onRecorded={refreshProgress} />
          {resources.length ? <section className="mt-8 xl:hidden"><h3 className="mb-3 text-sm font-medium">Contenido de esta lección</h3><ResourceList resources={resources} selectedAssetId={selectedAsset?.id ?? null} onSelect={setSelectedAssetId} /></section> : null}
          {visibleExams.length ? <section className="mt-8 border border-line bg-sand-soft p-5"><p className="font-tabular text-xs text-jade-deep">EVALUACIÓN</p>{visibleExams.map((exam) => <div className="mt-3 flex flex-wrap items-center justify-between gap-4" key={exam.id}><div><h3 className="font-medium">{exam.title}</h3><p className="mt-1 text-sm text-muted">Aprobás con {Number(exam.passing_score)}%.</p></div><Link className="flex h-11 items-center gap-2 rounded-sm bg-jade px-4 text-sm font-medium text-white transition-colors hover:bg-jade-deep" href={`/cursos/examen/${exam.id}`}>Rendir <ChevronRight className="size-4" aria-hidden="true" /></Link></div>)}</section> : null}
          <nav className="mt-10 flex justify-between gap-4 border-t border-line pt-5" aria-label="Navegación entre módulos">{data.previousModule ? <Link className="flex h-11 items-center gap-2 rounded-sm border px-4 text-sm text-muted transition-colors hover:bg-surface hover:text-ink" href={`${coursePath}/${data.previousModule.id}`}><ChevronLeft className="size-4" aria-hidden="true" />Anterior</Link> : <span />}{data.nextModule ? <Link className="ml-auto flex h-11 items-center gap-2 rounded-sm bg-jade px-4 text-sm font-medium text-white transition-colors hover:bg-jade-deep" href={`${coursePath}/${data.nextModule.id}`}>Siguiente <ChevronRight className="size-4" aria-hidden="true" /></Link> : <Link className="ml-auto flex h-11 items-center gap-2 rounded-sm bg-jade px-4 text-sm font-medium text-white transition-colors hover:bg-jade-deep" href="/cursos/progreso">Ver progreso <ChevronRight className="size-4" aria-hidden="true" /></Link>}</nav>
        </div>
      </main>

      <aside className="hidden border-l border-line bg-paper xl:block">
        <div className="sticky top-0 p-5"><div className="mb-4 flex items-center justify-between gap-3"><h3 className="font-medium">Contenido</h3><span className="font-tabular text-xs text-muted">{resources.length}</span></div>{resources.length ? <ResourceList resources={resources} selectedAssetId={selectedAsset?.id ?? null} onSelect={setSelectedAssetId} /> : <p className="text-sm text-muted">No hay recursos en esta lección.</p>}</div>
      </aside>
    </div>
  );
}