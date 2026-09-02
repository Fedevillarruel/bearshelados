"use client";

import Link from "next/link";
import Image from "next/image";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  BarChart3, BookOpen, Building2, CheckCircle2, ChevronRight,
  FileText, GraduationCap, LayoutDashboard, LogOut, Menu, MoreHorizontal,
  Settings, Users, type LucideIcon,
} from "lucide-react";

type Role = "admin" | "franquiciado" | "empleado";
type View = "dashboard" | "users" | "courses" | "manuals" | "franchises" | "team" | "learning" | "progress";

type NavigationItem = { href: string; label: string; icon: LucideIcon; view: View };

const dashboardData = [
  { name: "Inducción", completado: 71, pendiente: 29 },
  { name: "Caja", completado: 58, pendiente: 42 },
];
const weeklyData = [
  { name: "05 Ago", hours: 18 }, { name: "12 Ago", hours: 24 }, { name: "19 Ago", hours: 31 }, { name: "26 Ago", hours: 27 },
];
const employees = [
  { name: "Lucía Fernández", position: "Encargada de salón", franchise: "Palermo", progress: 76, score: 88, access: "Hoy, 09:42", state: "Al día" },
  { name: "Mateo Rivas", position: "Atención al cliente", franchise: "Palermo", progress: 33, score: 65, access: "Hace 4 días", state: "Requiere atención" },
  { name: "Sofía Carrizo", position: "Cajera", franchise: "Belgrano", progress: 100, score: 91, access: "Ayer, 17:16", state: "Completado" },
  { name: "Tomás Molina", position: "Heladero", franchise: "Belgrano", progress: 58, score: 74, access: "Hoy, 11:20", state: "En progreso" },
];
const courseModules = [
  "Bienvenida", "Introducción a la empresa", "Misión, visión y valores", "Estándares de calidad", "Experiencia bears", "Tipo de visitas", "Uniforme e higiene", "Vestuario", "Manejo de stock",
];

function navForRole(role: Role): NavigationItem[] {
  if (role === "admin") return [
    { href: "/admin/dashboard", label: "Resumen", icon: LayoutDashboard, view: "dashboard" },
    { href: "/admin/usuarios", label: "Usuarios", icon: Users, view: "users" },
    { href: "/admin/cursos", label: "Cursos", icon: BookOpen, view: "courses" },
    { href: "/admin/manuales", label: "Manuales", icon: FileText, view: "manuals" },
    { href: "/admin/franquicias", label: "Franquicias", icon: Building2, view: "franchises" },
  ];
  if (role === "franquiciado") return [
    { href: "/franquicia/dashboard", label: "Resumen", icon: LayoutDashboard, view: "dashboard" },
    { href: "/franquicia/equipo", label: "Equipo", icon: Users, view: "team" },
    { href: "/franquicia/manuales", label: "Manuales", icon: FileText, view: "manuals" },
  ];
  return [
    { href: "/cursos/mis-cursos", label: "Mis cursos", icon: BookOpen, view: "learning" },
    { href: "/cursos/progreso", label: "Mi progreso", icon: BarChart3, view: "progress" },
  ];
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="border-b border-line py-4 sm:border-b-0 sm:border-r sm:px-5 sm:first:pl-0 sm:last:border-r-0">
    <p className="text-xs text-muted">{label}</p>
    <p className="font-tabular mt-2 text-2xl font-medium">{value}</p>
    <p className="mt-1 text-xs text-muted">{detail}</p>
  </div>;
}

function Status({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "success" | "warning" | "alert" | "neutral" }) {
  const styles = { success: "bg-[#E0F1EB] text-jade-deep", warning: "bg-sand-soft text-ink", alert: "bg-[#FCEAE6] text-alert", neutral: "bg-surface text-muted" };
  return <span className={`inline-flex rounded-sm px-2 py-1 text-xs font-medium ${styles[tone]}`}>{children}</span>;
}

function Dashboard({ role }: { role: Role }) {
  const isFranchise = role === "franquiciado";
  return <>
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div><h1 className="text-[31px] font-medium leading-tight">{isFranchise ? "Franquicia Palermo" : "Resumen general"}</h1><p className="mt-2 text-sm text-muted">{isFranchise ? "Seguimiento de tu equipo y sus cursos asignados." : "Estado de capacitación en toda la operación."}</p></div>
      <button className="flex h-10 items-center gap-2 rounded-sm border px-3 text-sm font-medium hover:bg-surface"><FileText className="size-4" /> Exportar</button>
    </header>
    <section className="mt-8 grid border border-line sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      <Metric label={isFranchise ? "Equipo activo" : "Usuarios activos"} value={isFranchise ? "12" : "128"} detail="En capacitación" />
      <Metric label="Cursos publicados" value="7" detail="2 actualizados este mes" />
      <Metric label="Finalización global" value="68.4%" detail="+4.8% vs. mes anterior" />
      <Metric label="Nota promedio" value="82.6" detail="Sobre 100 puntos" />
      <Metric label="Horas de video" value="146 h" detail="Últimos 30 días" />
      <Metric label="Reprobados" value="9" detail="En los últimos 30 días" />
    </section>
    <section className="mt-8 grid gap-5 xl:grid-cols-2">
      <article className="min-h-[310px] border border-line bg-paper p-5">
        <div className="flex items-start justify-between"><div><h2 className="text-base font-medium">Finalización por curso</h2><p className="mt-1 text-sm text-muted">Porcentaje de empleados que completaron el recorrido.</p></div><MoreHorizontal className="size-5 text-muted" /></div>
        <div className="mt-5 h-52"><ResponsiveContainer width="100%" height="100%"><BarChart data={dashboardData} barGap={4}><CartesianGrid vertical={false} stroke="var(--line)" /><XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "var(--muted)", fontSize: 12 }} /><YAxis axisLine={false} tickLine={false} tick={{ fill: "var(--muted)", fontSize: 12 }} /><Tooltip cursor={{ fill: "var(--surface)" }} /><Bar dataKey="completado" fill="var(--jade)" radius={0} /><Bar dataKey="pendiente" fill="var(--sand)" radius={0} /></BarChart></ResponsiveContainer></div>
      </article>
      <article className="min-h-[310px] border border-line bg-paper p-5">
        <div className="flex items-start justify-between"><div><h2 className="text-base font-medium">Horas de video</h2><p className="mt-1 text-sm text-muted">Consumo semanal del equipo.</p></div><MoreHorizontal className="size-5 text-muted" /></div>
        <div className="mt-5 h-52"><ResponsiveContainer width="100%" height="100%"><AreaChart data={weeklyData}><CartesianGrid vertical={false} stroke="var(--line)" /><XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "var(--muted)", fontSize: 12 }} /><YAxis axisLine={false} tickLine={false} tick={{ fill: "var(--muted)", fontSize: 12 }} /><Tooltip /><Area type="monotone" dataKey="hours" stroke="var(--jade)" strokeWidth={2} fill="var(--jade)" fillOpacity={0.14} /></AreaChart></ResponsiveContainer></div>
      </article>
    </section>
    <section className="mt-8 border border-line bg-paper"><div className="flex items-center justify-between border-b border-line px-5 py-4"><div><h2 className="font-medium">{isFranchise ? "Actividad del equipo" : "Requiere atención"}</h2><p className="mt-1 text-sm text-muted">Vencimientos, reintentos y falta de actividad reciente.</p></div><Link href={isFranchise ? "/franquicia/equipo" : "/admin/usuarios"} className="text-sm font-medium text-jade-deep hover:underline">Ver listado</Link></div><EmployeeTable compact /></section>
  </>;
}

function EmployeeTable({ compact = false }: { compact?: boolean }) {
  return <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead className="bg-surface text-xs text-muted"><tr><th className="px-5 py-3 font-medium">Empleado</th><th className="px-5 py-3 font-medium">Franquicia</th><th className="px-5 py-3 font-medium">Progreso</th><th className="px-5 py-3 font-medium">Nota</th><th className="px-5 py-3 font-medium">Último acceso</th><th className="px-5 py-3 font-medium">Estado</th></tr></thead><tbody>{employees.slice(0, compact ? 3 : employees.length).map((employee) => <tr className="border-t border-line" key={employee.name}><td className="px-5 py-4"><p className="font-medium">{employee.name}</p><p className="mt-1 text-xs text-muted">{employee.position}</p></td><td className="px-5 py-4 text-muted">{employee.franchise}</td><td className="px-5 py-4"><div className="flex items-center gap-3"><div className="h-1.5 w-20 overflow-hidden bg-surface"><div className="h-full bg-jade" style={{ width: `${employee.progress}%` }} /></div><span className="font-tabular text-xs">{employee.progress}%</span></div></td><td className="font-tabular px-5 py-4">{employee.score}</td><td className="px-5 py-4 text-muted">{employee.access}</td><td className="px-5 py-4"><Status tone={employee.state === "Requiere atención" ? "alert" : employee.state === "Completado" || employee.state === "Al día" ? "success" : "warning"}>{employee.state}</Status></td></tr>)}</tbody></table></div>;
}

function UsersView() {
  return <><header className="flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-[31px] font-medium leading-tight">Usuarios</h1><p className="mt-2 text-sm text-muted">Altas, asignaciones y estado de capacitación.</p></div><button className="h-10 rounded-sm bg-jade px-4 text-sm font-medium text-white hover:bg-jade-deep">Nuevo usuario</button></header><div className="mt-8 flex flex-wrap gap-3 border-y border-line py-3"><input className="h-10 min-w-52 rounded-sm border bg-paper px-3 text-sm" placeholder="Buscar por nombre o correo" aria-label="Buscar usuarios" /><button className="h-10 rounded-sm border px-3 text-sm">Franquicia</button><button className="h-10 rounded-sm border px-3 text-sm">Puesto</button><button className="h-10 rounded-sm border px-3 text-sm">Estado</button></div><section className="mt-5 border border-line bg-paper"><EmployeeTable /></section></>;
}

function CoursesView() {
  const courses = [{ title: "Inducción Bears", modules: 9, students: 86, status: "Publicado", progress: 71 }, { title: "Caja y arqueo", modules: 3, students: 42, status: "Publicado", progress: 58 }];
  return <><header className="flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-[31px] font-medium leading-tight">Cursos</h1><p className="mt-2 text-sm text-muted">Contenido, módulos, evaluaciones y asignaciones.</p></div><button className="h-10 rounded-sm bg-jade px-4 text-sm font-medium text-white hover:bg-jade-deep">Nuevo curso</button></header><section className="mt-8 divide-y divide-line border border-line bg-paper">{courses.map((course) => <article className="flex flex-wrap items-center justify-between gap-4 p-5" key={course.title}><div className="flex items-center gap-4"><div className="grid size-12 place-items-center bg-ink text-paper"><GraduationCap className="size-5" /></div><div><h2 className="font-medium">{course.title}</h2><p className="mt-1 text-sm text-muted">{course.modules} módulos, {course.students} personas asignadas</p></div></div><div className="flex items-center gap-5"><div className="hidden w-32 sm:block"><div className="mb-1 flex justify-between text-xs text-muted"><span>Finalización</span><span className="font-tabular">{course.progress}%</span></div><div className="h-1.5 bg-surface"><div className="h-full bg-jade" style={{ width: `${course.progress}%` }} /></div></div><Status tone="success">{course.status}</Status><Link href="/cursos/induccion-bears/modulos/1" className="grid size-10 place-items-center rounded-sm border hover:bg-surface" aria-label={`Abrir ${course.title}`}><ChevronRight className="size-4" /></Link></div></article>)}</section></>;
}

function ManualsView() {
  const manuals = ["Manual de operaciones del local", "Estándares de calidad y servicio", "Normas de higiene y seguridad", "Guía de apertura y cierre"];
  return <><header className="flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-[31px] font-medium leading-tight">Manuales e instructivos</h1><p className="mt-2 text-sm text-muted">Documentación vigente para la operación.</p></div><button className="h-10 rounded-sm bg-jade px-4 text-sm font-medium text-white hover:bg-jade-deep">Subir manual</button></header><section className="mt-8 grid gap-px border border-line bg-line sm:grid-cols-2">{manuals.map((manual, index) => <article className="bg-paper p-5" key={manual}><FileText className="size-5 text-jade" /><h2 className="mt-8 font-medium">{manual}</h2><p className="mt-2 text-sm text-muted">PDF, versión {index + 1}. Actualizado este mes.</p><button className="mt-6 h-10 rounded-sm border px-3 text-sm font-medium hover:bg-surface">Ver documento</button></article>)}</section></>;
}

function FranchisesView() {
  return <><header><h1 className="text-[31px] font-medium leading-tight">Franquicias</h1><p className="mt-2 text-sm text-muted">Cobertura y desempeño por operación.</p></header><section className="mt-8 grid gap-5 lg:grid-cols-2">{["Palermo", "Belgrano"].map((franchise, index) => <article className="border border-line bg-paper p-5" key={franchise}><div className="flex items-center justify-between"><div className="grid size-10 place-items-center bg-surface"><Building2 className="size-5" /></div><Status tone="success">Activa</Status></div><h2 className="mt-8 text-xl font-medium">{franchise}</h2><p className="mt-2 text-sm text-muted">Buenos Aires, CABA</p><div className="mt-8 grid grid-cols-3 border-y border-line py-4"><Metric label="Equipo" value={index ? "6" : "12"} detail="Personas" /><Metric label="Progreso" value={index ? "64%" : "71%"} detail="Promedio" /><Metric label="Nota" value={index ? "79" : "83"} detail="Promedio" /></div><button className="mt-5 h-10 rounded-sm border px-3 text-sm font-medium hover:bg-surface">Ver franquicia</button></article>)}</section></>;
}

function LearningView({ progressOnly = false }: { progressOnly?: boolean }) {
  if (progressOnly) return <><header><h1 className="text-[31px] font-medium leading-tight">Mi progreso</h1><p className="mt-2 text-sm text-muted">Historial de cursos, evaluaciones y certificaciones.</p></header><section className="mt-8 border border-line bg-paper"><EmployeeTable compact /></section></>;
  return <><header className="flex items-end justify-between gap-4"><div><p className="text-sm text-muted">Inducción</p><h1 className="mt-2 text-[31px] font-medium leading-tight">Mis cursos</h1></div><span className="font-tabular text-sm text-muted">1 de 2 activos</span></header><section className="mt-8 grid gap-5 lg:grid-cols-2"><Link href="/cursos/induccion-bears/modulos/1" className="group border border-line bg-paper p-5 transition-colors hover:border-jade"><div className="flex aspect-[16/8] items-end bg-ink p-5 text-paper"><div><p className="font-tabular text-xs text-[#EED683]">INDUCCIÓN</p><h2 className="mt-2 text-xl font-medium">Inducción Bears</h2></div></div><div className="mt-5 flex items-center justify-between"><div><p className="text-sm text-muted">9 módulos</p><p className="mt-1 font-medium">En progreso</p></div><div className="grid size-14 place-items-center rounded-full border-4 border-jade font-tabular text-xs">44%</div></div></Link><article className="border border-line bg-paper p-5"><div className="flex aspect-[16/8] items-end bg-sand p-5"><div><p className="font-tabular text-xs">OPERACIÓN</p><h2 className="mt-2 text-xl font-medium">Caja y arqueo</h2></div></div><div className="mt-5 flex items-center justify-between"><div><p className="text-sm text-muted">3 módulos</p><p className="mt-1 font-medium">Asignado</p></div><div className="grid size-14 place-items-center rounded-full border-4 border-line font-tabular text-xs">0%</div></div></article></section></>;
}

export function CoursePlayer() {
  return <div className="min-h-screen bg-paper lg:grid lg:grid-cols-[280px_minmax(0,1fr)]"><aside className="border-b border-line p-5 lg:min-h-screen lg:border-b-0 lg:border-r"><Link href="/cursos/mis-cursos" className="text-sm text-muted hover:text-ink">Mis cursos</Link><h1 className="mt-5 text-xl font-medium">Inducción Bears</h1><ol className="mt-6 space-y-1">{courseModules.map((module, index) => <li key={module}><button className={`flex min-h-11 w-full items-center gap-3 px-2 text-left text-sm ${index === 0 ? "bg-surface font-medium" : "text-muted hover:bg-surface"}`}><span className="font-tabular text-xs">{String(index + 1).padStart(2, "0")}</span>{index === 0 ? <CheckCircle2 className="ml-auto size-4 text-jade" /> : null}<span className={index === 0 ? "" : "ml-auto"}>{module}</span></button></li>)}</ol></aside><main className="px-5 py-8 sm:px-8 lg:px-12"><div className="mx-auto max-w-4xl"><p className="font-tabular text-sm text-muted">MÓDULO 01</p><h2 className="mt-2 text-[31px] font-medium leading-tight">Bienvenida</h2><div className="mt-8 overflow-hidden bg-ink"><video className="aspect-video w-full" controls preload="metadata" poster=""><source src="https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4" type="video/mp4" /></video></div><article className="mt-8 max-w-2xl text-base leading-8"><h3 className="text-xl font-medium">Empezamos juntos</h3><p className="mt-4 text-muted">En Bears, cada visita se construye con atención, cuidado por el producto y un equipo que conoce los estándares de la casa. Este recorrido te acompaña desde los fundamentos de la marca hasta las tareas cotidianas del local.</p></article><div className="mt-10 flex justify-between border-t border-line pt-5"><button className="h-11 rounded-sm border px-4 text-sm text-muted" disabled>Anterior</button><button className="flex h-11 items-center gap-2 rounded-sm bg-jade px-4 text-sm font-medium text-white hover:bg-jade-deep">Siguiente <ChevronRight className="size-4" /></button></div></div></main></div>;
}

export function PortalShell({ role, view }: { role: Role; view: View }) {
  const navigation = navForRole(role);
  const labels = { admin: "Administración", franquiciado: "Franquicia Palermo", empleado: "Capacitación" };
  const content = view === "dashboard" ? <Dashboard role={role} /> : view === "users" || view === "team" ? <UsersView /> : view === "courses" ? <CoursesView /> : view === "manuals" ? <ManualsView /> : view === "franchises" ? <FranchisesView /> : <LearningView progressOnly={view === "progress"} />;
  return <div className="min-h-screen bg-paper lg:grid lg:grid-cols-[248px_minmax(0,1fr)]"><aside className="hidden bg-jade-deep px-4 py-5 text-paper lg:flex lg:flex-col"><Link href="/" className="flex h-12 items-center gap-3 px-2"><span className="grid size-9 place-items-center rounded-sm bg-paper p-1"><Image src="https://dolltmxtcoawmpltsnrk.supabase.co/storage/v1/object/public/logo/lKkmRZZESHaaJgzufeQk_k9T3668M10wqK2R0.webp" alt="Bears Helados" width={28} height={28} className="max-h-full max-w-full object-contain" /></span><span className="text-sm font-medium">Bears Helados</span></Link><p className="mt-10 px-2 text-xs text-white/70">{labels[role]}</p><nav className="mt-3 space-y-1">{navigation.map((item) => { const Icon = item.icon; return <Link className={`flex h-11 items-center gap-3 rounded-sm px-3 text-sm transition-colors ${view === item.view ? "bg-paper text-ink" : "text-white/85 hover:bg-white/15 hover:text-paper"}`} href={item.href} key={item.href}><Icon className="size-4" />{item.label}</Link>; })}</nav><div className="mt-auto border-t border-white/25 pt-4"><button className="flex h-10 w-full items-center gap-3 px-3 text-sm text-white/75 hover:text-paper"><Settings className="size-4" />Preferencias</button><Link href="/" className="flex h-10 items-center gap-3 px-3 text-sm text-white/75 hover:text-paper"><LogOut className="size-4" />Salir</Link></div></aside><div className="pb-20 lg:pb-0"><header className="flex h-16 items-center justify-between border-b border-line px-5 sm:px-8"><button className="grid size-10 place-items-center lg:hidden" aria-label="Abrir navegación"><Menu className="size-5" /></button><p className="hidden text-sm text-muted lg:block">{labels[role]}</p><div className="flex items-center gap-3"><span className="hidden text-right sm:block"><span className="block text-sm font-medium">Administrador Bears</span><span className="block text-xs text-muted">Cuenta de demostración</span></span><span className="grid size-9 place-items-center rounded-full bg-sand text-sm font-medium text-ink">AB</span></div></header><main className="mx-auto w-full max-w-[1600px] p-5 sm:p-8">{content}</main></div><nav className="fixed inset-x-0 bottom-0 z-10 grid h-16 grid-cols-3 border-t border-line bg-paper lg:hidden">{navigation.slice(0, 3).map((item) => { const Icon = item.icon; return <Link href={item.href} key={item.href} className={`grid place-items-center text-xs ${view === item.view ? "text-jade-deep" : "text-muted"}`}><span className="grid justify-items-center gap-1"><Icon className="size-5" />{item.label}</span></Link>; })}</nav></div>;
}