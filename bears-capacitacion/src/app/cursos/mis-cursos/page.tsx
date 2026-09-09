/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { BookOpen, CalendarDays, ChevronRight, Clock3 } from "lucide-react";
import { PortalShell } from "@/components/portal/portal-shell";
import { PortalLayout } from "@/components/portal/portal-layout";
import { requireRole } from "@/lib/auth/roles";
import { getEmployeeCourses } from "@/lib/platform/employee";
import { isSupabaseConfigured } from "@/lib/supabase/config";

function formatDate(date: string | null) {
  return date
    ? new Intl.DateTimeFormat("es-AR", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(new Date(`${date}T12:00:00`))
    : "Sin fecha límite";
}

function formatDuration(minutes: number | null) {
  const totalMinutes = Math.max(0, Math.round(Number(minutes ?? 0)));
  const hours = Math.floor(totalMinutes / 60);
  const remainingMinutes = totalMinutes % 60;
  if (!hours) return `${totalMinutes} min`;
  return remainingMinutes ? `${hours} h ${remainingMinutes} min` : `${hours} h`;
}

export default async function MyCoursesPage() {
  if (!isSupabaseConfigured())
    return <PortalShell role="empleado" view="learning" />;

  const viewer = await requireRole(["empleado", "franquiciado"]);
  const courses = await getEmployeeCourses(viewer);

  return (
    <PortalLayout viewer={viewer} activeKey="learning">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted">Tu recorrido</p>
          <h1 className="mt-2 text-[31px] font-medium leading-tight">
            Mis cursos
          </h1>
        </div>
        <span className="font-tabular text-sm text-muted">
          {
            courses.filter(
              (course) => course.enrollment.status !== "completado",
            ).length
          }{" "}
          activos
        </span>
      </header>
      {courses.length ? (
        <section className="mt-8 grid gap-5 lg:grid-cols-2">
          {courses.map((course, index) => {
            const href = course.firstModuleId
              ? `/cursos/${course.slug}/modulos/${course.firstModuleId}`
              : null;
            const accent =
              index % 2 === 0 ? "bg-jade-deep text-paper" : "bg-sand text-ink";
            const status =
              course.enrollment.status === "completado"
                ? "Completado"
                : course.enrollment.status === "en_progreso"
                  ? "En progreso"
                  : "Asignado";
            const content = (
              <>
                <div
                  className={`relative flex aspect-16/8 items-end overflow-hidden ${course.cover_url ? "bg-ink text-paper" : accent}`}
                >
                  {course.cover_url ? (
                    <img
                      className="absolute inset-0 size-full object-cover"
                      src={course.cover_url}
                      alt=""
                    />
                  ) : null}
                  <div className={course.cover_url ? "relative bg-ink/80 px-5 py-4" : "p-5"}>
                    <p className="font-tabular text-xs opacity-80">
                      {course.category ?? "CAPACITACIÓN"}
                    </p>
                    <h2 className="mt-2 text-xl font-medium">{course.title}</h2>
                  </div>
                </div>
                <div className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm text-muted">
                        {course.moduleCount} módulos
                      </p>
                      <p className="mt-1 flex items-center gap-2 text-sm text-muted">
                        <Clock3 className="size-4" aria-hidden="true" />
                        {formatDuration(course.estimated_minutes)}
                      </p>
                      <p className="mt-1 font-medium">{status}</p>
                    </div>
                    <span className="font-tabular text-2xl font-medium">
                      {Math.round(Number(course.enrollment.progress_percent))}%
                    </span>
                  </div>
                  <div className="mt-5 h-1.5 overflow-hidden bg-surface">
                    <div
                      className="h-full bg-jade"
                      style={{
                        width: `${Math.min(100, Math.max(0, Number(course.enrollment.progress_percent)))}%`,
                      }}
                    />
                  </div>
                  <p className="mt-4 flex items-center gap-2 text-sm text-muted">
                    <CalendarDays className="size-4" aria-hidden="true" />
                    {formatDate(course.enrollment.due_date)}
                  </p>
                </div>
              </>
            );
            return href ? (
              <Link
                key={course.id}
                href={href}
                className="group overflow-hidden border border-line bg-paper transition-colors hover:border-jade"
              >
                {content}
              </Link>
            ) : (
              <article
                key={course.id}
                className="overflow-hidden border border-line bg-paper"
              >
                {content}
              </article>
            );
          })}
        </section>
      ) : (
        <section className="mt-8 border border-dashed border-line bg-surface p-8">
          <BookOpen className="size-6 text-jade" aria-hidden="true" />
          <h2 className="mt-5 text-lg font-medium">
            Todavía no tenés cursos asignados
          </h2>
          <p className="mt-2 max-w-md text-sm leading-6 text-muted">
            Tu supervisor te va a asignar el primero cuando esté listo.
          </p>
        </section>
      )}
      <Link
        href="/cursos/progreso"
        className="mt-8 inline-flex h-11 items-center gap-2 text-sm font-medium text-jade-deep hover:underline"
      >
        Ver mi progreso <ChevronRight className="size-4" aria-hidden="true" />
      </Link>
    </PortalLayout>
  );
}
