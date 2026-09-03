import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BarChart3, Building2, GraduationCap, Users } from "lucide-react";

export const metadata: Metadata = {
  title: "Demostración | Bears Helados",
  robots: { index: false, follow: false },
};

const metrics = [
  { label: "Personas activas", value: "128", icon: Users },
  { label: "Cursos publicados", value: "7", icon: GraduationCap },
  { label: "Finalización global", value: "68,4%", icon: BarChart3 },
  { label: "Franquicias", value: "12", icon: Building2 },
];

const courses = [
  { title: "Inducción Bears", completion: "71%", people: "86 personas" },
  { title: "Caja y arqueo", completion: "58%", people: "42 personas" },
];

export default function DemoPage() {
  return <main className="min-h-screen bg-paper px-5 py-8 sm:px-8 sm:py-12"><div className="mx-auto max-w-6xl"><header className="flex flex-wrap items-end justify-between gap-5 border-b border-line pb-8"><div><p className="text-sm text-muted">Bears Helados</p><h1 className="mt-2 text-[31px] font-medium leading-tight">Datos de demostración</h1><p className="mt-3 max-w-xl text-sm leading-6 text-muted">Vista ilustrativa de los indicadores disponibles para administración. No contiene información operativa ni cuentas reales.</p></div><Link href="/login" className="inline-flex h-11 items-center gap-2 rounded-sm bg-jade px-4 text-sm font-medium text-white transition-colors hover:bg-jade-deep">Ingresar a la plataforma <ArrowRight className="size-4" aria-hidden="true" /></Link></header><section className="grid border-x border-b border-line sm:grid-cols-2 lg:grid-cols-4">{metrics.map((metric) => { const Icon = metric.icon; return <article className="border-r border-t border-line p-5 last:border-r-0 sm:nth-[2n]:border-r-0 lg:nth-[2n]:border-r lg:last:border-r-0" key={metric.label}><Icon className="size-5 text-jade" aria-hidden="true" /><p className="mt-8 text-xs text-muted">{metric.label}</p><p className="font-tabular mt-2 text-3xl font-medium">{metric.value}</p></article>; })}</section><section className="mt-8 border border-line bg-paper"><div className="border-b border-line px-5 py-4"><h2 className="font-medium">Finalización por curso</h2><p className="mt-1 text-sm text-muted">Ejemplo de lectura para un responsable de capacitación.</p></div><div className="divide-y divide-line">{courses.map((course) => <article className="flex flex-wrap items-center justify-between gap-5 px-5 py-5" key={course.title}><div><h3 className="font-medium">{course.title}</h3><p className="mt-1 text-sm text-muted">{course.people} asignadas</p></div><div className="w-full sm:w-64"><div className="flex justify-between text-xs text-muted"><span>Finalización</span><span className="font-tabular">{course.completion}</span></div><div className="mt-2 h-1.5 bg-surface"><div className="h-full bg-jade" style={{ width: course.completion }} /></div></div></article>)}</div></section></div></main>;
}