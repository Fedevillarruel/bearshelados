"use client";

import Image from "next/image";
import Link from "next/link";
import {
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  ImageIcon,
  PlayCircle,
} from "lucide-react";
import { useVideoTracking } from "@/hooks/use-video-tracking";
import type {
  EmployeeAsset,
  EmployeeCourseModule,
} from "@/lib/platform/employee";

function formatMinutes(seconds: number) {
  return `${Math.max(1, Math.ceil(seconds / 60))} min`;
}

function contentText(value: string) {
  return value
    .replace(/<\/?p>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .trim();
}

function TrackedVideo({ asset }: { asset: EmployeeAsset }) {
  const { videoRef } = useVideoTracking({
    assetId: asset.id,
    durationSeconds: asset.duration_seconds,
    initialPosition: asset.progress?.last_position ?? 0,
    initialRanges: asset.progress?.watched_ranges ?? [],
  });

  return (
    <section className="overflow-hidden border border-line bg-ink">
      <video
        ref={videoRef}
        className="aspect-video w-full"
        controls
        preload="metadata"
        poster={asset.video_poster_url ?? undefined}
        onLoadedMetadata={() => {
          if (videoRef.current && asset.progress?.last_position)
            videoRef.current.currentTime = asset.progress.last_position;
        }}
      >
        <source src={asset.url} type="video/mp4" />
        Tu navegador no puede reproducir este video.
      </video>
      <div className="flex items-center justify-between gap-4 border-t border-white/15 px-4 py-3 text-sm text-white/75">
        <span className="flex items-center gap-2">
          <PlayCircle className="size-4" aria-hidden="true" />
          {asset.title}
        </span>
        <span className="font-tabular whitespace-nowrap">
          {asset.progress?.completed
            ? "Completado"
            : formatMinutes(asset.duration_seconds)}
        </span>
      </div>
    </section>
  );
}

function AssetContent({ asset }: { asset: EmployeeAsset }) {
  if (asset.type === "video") return <TrackedVideo asset={asset} />;
  if (asset.type === "pdf")
    return (
      <section className="overflow-hidden border border-line">
        <div className="flex items-center gap-3 border-b border-line bg-surface px-4 py-3">
          <FileText className="size-4 text-jade-deep" aria-hidden="true" />
          <p className="text-sm font-medium">{asset.title}</p>
        </div>
        <iframe
          className="h-[68vh] min-h-96 w-full bg-paper"
          src={asset.url}
          title={asset.title}
        >
          Tu navegador no permite previsualizar este documento.
        </iframe>
      </section>
    );
  if (asset.type === "image")
    return (
      <figure className="overflow-hidden border border-line">
        <Image
          className="aspect-video w-full object-cover"
          src={asset.url}
          alt={asset.description ?? asset.title}
          width={1200}
          height={675}
          sizes="(max-width: 1024px) 100vw, 900px"
        />
        <figcaption className="flex items-center gap-2 px-4 py-3 text-sm text-muted">
          <ImageIcon className="size-4" aria-hidden="true" />
          {asset.title}
        </figcaption>
      </figure>
    );
  if (asset.type === "link")
    return (
      <a
        className="flex min-h-16 items-center justify-between gap-4 border border-line px-4 py-3 text-sm font-medium text-jade-deep transition-colors hover:bg-surface"
        href={asset.url}
        target="_blank"
        rel="noreferrer"
      >
        <span>{asset.title}</span>
        <ExternalLink className="size-4 shrink-0" aria-hidden="true" />
      </a>
    );
  return (
    <article className="border border-line bg-paper p-5 sm:p-6">
      <h3 className="text-xl font-medium">{asset.title}</h3>
      {asset.description ? (
        <p className="mt-3 text-sm leading-6 text-muted">{asset.description}</p>
      ) : null}
      <p className="mt-5 whitespace-pre-line text-base leading-8">
        {contentText(asset.url)}
      </p>
    </article>
  );
}

export function EmployeeCoursePlayer({ data }: { data: EmployeeCourseModule }) {
  const moduleNumber =
    data.modules.findIndex((module) => module.id === data.currentModule.id) + 1;
  const coursePath = `/cursos/${data.course.slug}/modulos`;

  const visibleExams = [...data.exams, ...data.courseExams];
  return (
    <div className="min-h-screen bg-paper lg:grid lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="border-b border-line bg-paper p-5 lg:min-h-screen lg:border-b-0 lg:border-r">
        <Link
          href="/cursos/mis-cursos"
          className="text-sm text-muted transition-colors hover:text-ink"
        >
          Mis cursos
        </Link>
        <h1 className="mt-5 text-xl font-medium">{data.course.title}</h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          {data.course.summary ?? data.course.description}
        </p>
        <ol className="mt-6 space-y-1" aria-label="Módulos del curso">
          {data.modules.map((module, index) => {
            const active = module.id === data.currentModule.id;
            return (
              <li key={module.id}>
                <Link
                  href={`${coursePath}/${module.id}`}
                  className={`flex min-h-11 items-center gap-3 px-2 text-left text-sm transition-colors ${active ? "bg-surface font-medium" : "text-muted hover:bg-surface hover:text-ink"}`}
                  aria-current={active ? "page" : undefined}
                >
                  <span className="font-tabular text-xs">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  {active ? (
                    <CheckCircle2
                      className="ml-auto size-4 text-jade"
                      aria-hidden="true"
                    />
                  ) : (
                    <span className="ml-auto" />
                  )}
                  {module.title}
                </Link>
              </li>
            );
          })}
        </ol>
      </aside>
      <main className="px-5 py-8 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-4xl">
          <p className="font-tabular text-sm text-muted">
            MÓDULO {String(moduleNumber).padStart(2, "0")}
          </p>
          <h2 className="mt-2 text-[31px] font-medium leading-tight">
            {data.currentModule.title}
          </h2>
          {data.currentModule.description ? (
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
              {data.currentModule.description}
            </p>
          ) : null}
          <div className="mt-8 space-y-6">
            {data.assets.length ? (
              data.assets.map((asset) => (
                <AssetContent asset={asset} key={asset.id} />
              ))
            ) : (
              <section className="border border-dashed border-line bg-surface p-6">
                <BookOpen className="size-5 text-jade" aria-hidden="true" />
                <p className="mt-4 text-sm text-muted">
                  Este módulo todavía no tiene contenido publicado.
                </p>
              </section>
            )}
          </div>
          {visibleExams.length ? (
            <section className="mt-8 border border-line bg-sand-soft p-5">
              <p className="font-tabular text-xs text-jade-deep">EVALUACIÓN</p>
              {visibleExams.map((exam) => (
                <div
                  className="mt-3 flex flex-wrap items-center justify-between gap-4"
                  key={exam.id}
                >
                  <div>
                    <h3 className="font-medium">{exam.title}</h3>
                    <p className="mt-1 text-sm text-muted">
                      Aprobás con {Number(exam.passing_score)}%.
                    </p>
                  </div>
                  <Link
                    className="flex h-11 items-center gap-2 rounded-sm bg-jade px-4 text-sm font-medium text-white transition-colors hover:bg-jade-deep"
                    href={`/cursos/examen/${exam.id}`}
                  >
                    Rendir{" "}
                    <ChevronRight className="size-4" aria-hidden="true" />
                  </Link>
                </div>
              ))}
            </section>
          ) : null}
          <nav
            className="mt-10 flex justify-between gap-4 border-t border-line pt-5"
            aria-label="Navegación entre módulos"
          >
            {data.previousModule ? (
              <Link
                className="flex h-11 items-center gap-2 rounded-sm border px-4 text-sm text-muted transition-colors hover:bg-surface hover:text-ink"
                href={`${coursePath}/${data.previousModule.id}`}
              >
                <ChevronLeft className="size-4" aria-hidden="true" />
                Anterior
              </Link>
            ) : (
              <span />
            )}
            {data.nextModule ? (
              <Link
                className="ml-auto flex h-11 items-center gap-2 rounded-sm bg-jade px-4 text-sm font-medium text-white transition-colors hover:bg-jade-deep"
                href={`${coursePath}/${data.nextModule.id}`}
              >
                Siguiente <ChevronRight className="size-4" aria-hidden="true" />
              </Link>
            ) : (
              <Link
                className="ml-auto flex h-11 items-center gap-2 rounded-sm bg-jade px-4 text-sm font-medium text-white transition-colors hover:bg-jade-deep"
                href="/cursos/progreso"
              >
                Ver progreso{" "}
                <ChevronRight className="size-4" aria-hidden="true" />
              </Link>
            )}
          </nav>
        </div>
      </main>
    </div>
  );
}
