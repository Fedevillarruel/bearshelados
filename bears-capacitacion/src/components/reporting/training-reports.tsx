"use client";

import { useDeferredValue, useMemo, useState } from "react";
import Link from "next/link";
import { Download, Users } from "lucide-react";
import type { TeamMemberReport, TrainingOverview } from "@/lib/platform/reporting";

const statusClass = {
  "Al día": "bg-[#E0F1EB] text-jade-deep",
  "En progreso": "bg-sand-soft text-ink",
  Vencido: "bg-[#FCEAE6] text-alert",
  "Sin asignaciones": "bg-surface text-muted",
};

function percent(value: number | null) {
  return value === null ? "-" : `${Math.round(value)}%`;
}

function score(value: number | null) {
  return value === null ? "-" : value.toFixed(1);
}

function formatLastSeen(value: string | null) {
  if (!value) return "Sin actividad";
  return new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="border-b border-line px-4 py-4 sm:border-b-0 sm:border-r sm:last:border-r-0"><p className="text-xs text-muted">{label}</p><p className="mt-2 font-tabular text-2xl font-medium">{value}</p><p className="mt-1 text-xs text-muted">{detail}</p></div>;
}

function ProgressBar({ value }: { value: number | null }) {
  return <div className="h-1.5 overflow-hidden bg-surface"><div className="h-full bg-jade" style={{ width: `${Math.max(0, Math.min(100, value ?? 0))}%` }} /></div>;
}

export function TrainingDashboard({ overview, title, description, teamHref }: { overview: TrainingOverview; title: string; description: string; teamHref: string }) {
  const attention = [...overview.team]
    .sort((left, right) => {
      const statusOrder = { Vencido: 0, "En progreso": 1, "Sin asignaciones": 2, "Al día": 3 };
      return statusOrder[left.status] - statusOrder[right.status] || left.averageProgress - right.averageProgress;
    })
    .slice(0, 6);

  return <><header className="flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-[31px] font-medium leading-tight">{title}</h1><p className="mt-2 text-sm text-muted">{description}</p></div><a className="inline-flex h-10 items-center gap-2 rounded-sm border px-3 text-sm font-medium hover:bg-surface" href="/api/reportes/capacitacion.csv"><Download className="size-4" aria-hidden="true" />Exportar CSV</a></header><section className="mt-8 grid border border-line sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"><Metric label="Equipo activo" value={String(overview.activeEmployees)} detail="Empleados habilitados" /><Metric label="Cursos publicados" value={String(overview.publishedCourses)} detail="Con acceso vigente" /><Metric label="Finalización" value={percent(overview.completionPercent)} detail="Inscripciones completadas" /><Metric label="Nota promedio" value={score(overview.averageScore)} detail="Último intento por examen" /><Metric label="Video registrado" value={`${overview.watchedMinutes} min`} detail="Tiempo reproducido" /><Metric label="Reprobados" value={String(overview.failedAttemptsLast30Days)} detail="Últimos 30 días" /></section><section className="mt-8 grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]"><article className="border border-line bg-paper p-5"><div className="flex items-start justify-between gap-4"><div><h2 className="font-medium">Avance por curso</h2><p className="mt-1 text-sm text-muted">Finalización y progreso calculados desde inscripciones activas.</p></div><span className="font-tabular text-xs text-muted">{overview.courses.length} cursos</span></div><div className="mt-6 space-y-5">{overview.courses.map((course) => <div key={course.id}><div className="flex items-end justify-between gap-4"><div className="min-w-0"><p className="truncate text-sm font-medium">{course.title}</p><p className="mt-1 text-xs text-muted">{course.completedCount} de {course.enrollmentCount} completadas</p></div><span className="font-tabular text-sm">{percent(course.completionPercent)}</span></div><div className="mt-2"><ProgressBar value={course.completionPercent} /></div></div>)}{!overview.courses.length ? <p className="text-sm text-muted">Todavía no hay cursos publicados.</p> : null}</div></article><article className="border border-line bg-paper p-5"><div className="flex items-start justify-between gap-4"><div><h2 className="font-medium">Estado del equipo</h2><p className="mt-1 text-sm text-muted">Personas que requieren seguimiento prioritario.</p></div><Users className="size-5 text-jade" aria-hidden="true" /></div><div className="mt-6 divide-y divide-line border-y border-line">{attention.map((member) => <div className="flex items-center justify-between gap-4 py-3" key={member.id}><div className="min-w-0"><p className="truncate text-sm font-medium">{member.fullName ?? member.email}</p><p className="mt-1 text-xs text-muted">{member.assignedCourses} cursos · {percent(member.averageProgress)} promedio</p></div><span className={`shrink-0 rounded-sm px-2 py-1 text-xs font-medium ${statusClass[member.status]}`}>{member.status}</span></div>)}{!attention.length ? <p className="py-4 text-sm text-muted">No hay empleados activos en este alcance.</p> : null}</div><Link className="mt-5 inline-flex h-10 items-center text-sm font-medium text-jade-deep hover:underline" href={teamHref}>Ver equipo</Link></article></section></>;
}

export function TeamReportTable({ team, showFranchise, title = "Equipo", description = "Seguimiento de cursos, evaluaciones y actividad reciente." }: { team: TeamMemberReport[]; showFranchise: boolean; title?: string; description?: string }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const deferredQuery = useDeferredValue(query.trim().toLocaleLowerCase());
  const visibleTeam = useMemo(() => team.filter((member) => {
    const matchesSearch = !deferredQuery || [member.fullName, member.email, member.position, member.franchiseName].filter(Boolean).some((value) => value!.toLocaleLowerCase().includes(deferredQuery));
    return matchesSearch && (status === "all" || member.status === status);
  }), [deferredQuery, status, team]);

  return <><header className="flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-[31px] font-medium leading-tight">{title}</h1><p className="mt-2 text-sm text-muted">{description}</p></div><a className="inline-flex h-10 items-center gap-2 rounded-sm border px-3 text-sm font-medium hover:bg-surface" href="/api/reportes/capacitacion.csv"><Download className="size-4" aria-hidden="true" />Exportar CSV</a></header><section className="mt-8 flex flex-wrap gap-3 border-y border-line py-3"><input className="h-10 min-w-52 flex-1 rounded-sm border bg-paper px-3 text-sm outline-none focus:border-jade sm:max-w-sm" placeholder="Buscar por nombre o correo" aria-label="Buscar en el equipo" value={query} onChange={(event) => setQuery(event.target.value)} /><select className="h-10 rounded-sm border bg-paper px-3 text-sm" aria-label="Filtrar por estado" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">Todos los estados</option><option value="Vencido">Vencidos</option><option value="En progreso">En progreso</option><option value="Al día">Al día</option><option value="Sin asignaciones">Sin asignaciones</option></select></section><section className="mt-5 overflow-x-auto border border-line bg-paper"><table className="w-full min-w-220 text-left text-sm"><thead className="bg-surface text-xs text-muted"><tr><th className="px-5 py-3 font-medium">Empleado</th>{showFranchise ? <th className="px-5 py-3 font-medium">Franquicia</th> : null}<th className="px-5 py-3 font-medium">Cursos</th><th className="px-5 py-3 font-medium">Progreso</th><th className="px-5 py-3 font-medium">Nota</th><th className="px-5 py-3 font-medium">Video</th><th className="px-5 py-3 font-medium">Última actividad</th><th className="px-5 py-3 font-medium">Estado</th></tr></thead><tbody>{visibleTeam.map((member) => <tr className="border-t border-line" key={member.id}><td className="px-5 py-4"><p className="font-medium">{member.fullName ?? "Sin nombre"}</p><p className="mt-1 text-xs text-muted">{member.position ?? member.email}</p></td>{showFranchise ? <td className="px-5 py-4 text-muted">{member.franchiseName ?? "Sin franquicia"}</td> : null}<td className="px-5 py-4 font-tabular">{member.completedCourses}/{member.assignedCourses}</td><td className="px-5 py-4"><div className="flex items-center gap-3"><div className="w-20"><ProgressBar value={member.averageProgress} /></div><span className="font-tabular text-xs">{percent(member.averageProgress)}</span></div></td><td className="px-5 py-4 font-tabular">{score(member.averageScore)}</td><td className="px-5 py-4 font-tabular">{member.watchedMinutes} min</td><td className="px-5 py-4 text-xs text-muted">{formatLastSeen(member.lastSeenAt)}</td><td className="px-5 py-4"><span className={`inline-flex rounded-sm px-2 py-1 text-xs font-medium ${statusClass[member.status]}`}>{member.status}</span></td></tr>)}{!visibleTeam.length ? <tr><td className="px-5 py-10 text-center text-muted" colSpan={showFranchise ? 8 : 7}>No encontramos personas con esos filtros.</td></tr> : null}</tbody></table></section></>;
}