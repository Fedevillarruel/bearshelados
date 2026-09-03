import Link from "next/link";
import { BookOpen, ChevronRight, ClipboardCheck } from "lucide-react";
import { CertificateDownload } from "@/components/learning/certificate-download";
import { PortalShell } from "@/components/portal/portal-shell";
import { PortalLayout } from "@/components/portal/portal-layout";
import { requireRole } from "@/lib/auth/roles";
import { getEmployeeProgress } from "@/lib/platform/employee";
import { isSupabaseConfigured } from "@/lib/supabase/config";

function formatDate(date: string | null) {
	return date ? new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", year: "numeric" }).format(new Date(date)) : "Sin actividad registrada";
}

export default async function MyProgressPage() {
	if (!isSupabaseConfigured()) return <PortalShell role="empleado" view="progress" />;

	const viewer = await requireRole(["empleado", "franquiciado"]);
	const courses = await getEmployeeProgress(viewer);
	const completed = courses.filter((course) => course.enrollment.status === "completado").length;

	return <PortalLayout viewer={viewer} activeKey="progress"><header><p className="text-sm text-muted">Historial personal</p><h1 className="mt-2 text-[31px] font-medium leading-tight">Mi progreso</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-muted">Cursos, evaluaciones y certificados de tu recorrido de capacitación.</p></header><section className="mt-8 grid border border-line sm:grid-cols-3"><div className="p-5"><p className="text-xs text-muted">Cursos asignados</p><p className="font-tabular mt-2 text-3xl font-medium">{courses.length}</p></div><div className="border-t border-line p-5 sm:border-l sm:border-t-0"><p className="text-xs text-muted">Completados</p><p className="font-tabular mt-2 text-3xl font-medium">{completed}</p></div><div className="border-t border-line p-5 sm:border-l sm:border-t-0"><p className="text-xs text-muted">En progreso</p><p className="font-tabular mt-2 text-3xl font-medium">{courses.length - completed}</p></div></section>{courses.length ? <section className="mt-8 divide-y divide-line border border-line bg-paper">{courses.map((course) => <article className="flex flex-wrap items-center justify-between gap-5 p-5" key={course.id}><div><p className="text-xs text-muted">{course.category ?? "Capacitación"}</p><h2 className="mt-1 text-lg font-medium">{course.title}</h2><p className="mt-2 flex items-center gap-2 text-sm text-muted"><ClipboardCheck className="size-4" aria-hidden="true" />{course.averageScore === null ? "Todavía no registraste evaluaciones" : `Promedio de evaluaciones: ${Math.round(course.averageScore)}%`}</p><p className="mt-1 text-sm text-muted">Último intento: {formatDate(course.latestAttemptAt)}</p></div><div className="flex flex-wrap items-center gap-3"><div className="min-w-28"><p className="font-tabular text-right text-sm font-medium">{Math.round(Number(course.enrollment.progress_percent))}%</p><div className="mt-2 h-1.5 overflow-hidden bg-surface"><div className="h-full bg-jade" style={{ width: `${Math.min(100, Math.max(0, Number(course.enrollment.progress_percent)))}%` }} /></div></div>{course.enrollment.status === "completado" ? <CertificateDownload courseTitle={course.title} employeeName={viewer.fullName ?? viewer.email} completedAt={course.enrollment.completed_at} /> : <Link href={course.firstModuleId ? `/cursos/${course.slug}/modulos/${course.firstModuleId}` : "/cursos/mis-cursos"} className="inline-flex h-10 items-center gap-2 rounded-sm border px-3 text-sm font-medium transition-colors hover:bg-surface">Continuar <ChevronRight className="size-4" aria-hidden="true" /></Link>}</div></article>)}</section> : <section className="mt-8 border border-dashed border-line bg-surface p-8"><BookOpen className="size-6 text-jade" aria-hidden="true" /><h2 className="mt-5 text-lg font-medium">Todavía no hay progreso para mostrar</h2><p className="mt-2 max-w-md text-sm leading-6 text-muted">Cuando tengas un curso asignado, tus avances y evaluaciones van a aparecer acá.</p></section>}</PortalLayout>;
}