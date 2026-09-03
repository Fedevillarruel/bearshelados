import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  BarChart3,
  BookOpen,
  Building2,
  FileText,
  LayoutDashboard,
  LogOut,
  Users,
  type LucideIcon,
} from "lucide-react";
import { signOut } from "@/app/actions/auth";
import type { AppRole, Viewer } from "@/lib/auth/roles";
import { ThemeToggle } from "@/components/portal/theme-toggle";

type NavigationItem = { href: string; label: string; icon: LucideIcon; key: string };

const navigationByRole: Record<AppRole, NavigationItem[]> = {
  admin: [
    { href: "/admin/dashboard", label: "Resumen", icon: LayoutDashboard, key: "dashboard" },
    { href: "/admin/usuarios", label: "Usuarios", icon: Users, key: "users" },
    { href: "/admin/cursos", label: "Cursos", icon: BookOpen, key: "courses" },
    { href: "/admin/manuales", label: "Manuales", icon: FileText, key: "manuals" },
    { href: "/admin/franquicias", label: "Franquicias", icon: Building2, key: "franchises" },
  ],
  franquiciado: [
    { href: "/franquicia/dashboard", label: "Resumen", icon: LayoutDashboard, key: "dashboard" },
    { href: "/franquicia/equipo", label: "Equipo", icon: Users, key: "team" },
    { href: "/cursos/mis-cursos", label: "Mis cursos", icon: BookOpen, key: "learning" },
    { href: "/cursos/progreso", label: "Mi progreso", icon: BarChart3, key: "progress" },
    { href: "/franquicia/manuales", label: "Manuales", icon: FileText, key: "manuals" },
  ],
  empleado: [
    { href: "/cursos/mis-cursos", label: "Mis cursos", icon: BookOpen, key: "learning" },
    { href: "/cursos/progreso", label: "Mi progreso", icon: BarChart3, key: "progress" },
  ],
};

const roleLabels: Record<AppRole, string> = {
  admin: "Administración",
  franquiciado: "Franquicia",
  empleado: "Capacitación",
};

type PortalLayoutProps = {
  viewer: Viewer;
  activeKey: string;
  children: ReactNode;
};

export function PortalLayout({ viewer, activeKey, children }: PortalLayoutProps) {
  const navigation = navigationByRole[viewer.role];
  const initials = (viewer.fullName ?? viewer.email).split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();

  return <div className="min-h-screen bg-paper lg:grid lg:grid-cols-[248px_minmax(0,1fr)]"><aside className="hidden bg-jade-deep px-4 py-5 text-paper lg:flex lg:flex-col"><Link href={navigation[0].href} className="flex h-12 items-center gap-3 px-2"><span className="grid size-9 place-items-center rounded-sm bg-paper p-1"><Image src="https://dolltmxtcoawmpltsnrk.supabase.co/storage/v1/object/public/logo/lKkmRZZESHaaJgzufeQk_k9T3668M10wqK2R0.webp" alt="Bears Helados" width={28} height={28} className="max-h-full max-w-full object-contain" /></span><span className="text-sm font-medium">Bears Helados</span></Link><p className="mt-10 px-2 text-xs text-white/70">{roleLabels[viewer.role]}</p><nav className="mt-3 space-y-1" aria-label="Navegación principal">{navigation.map((item) => { const Icon = item.icon; const active = item.key === activeKey; return <Link className={`flex h-11 items-center gap-3 rounded-sm px-3 text-sm transition-colors ${active ? "bg-paper text-ink" : "text-white/85 hover:bg-white/15 hover:text-paper"}`} href={item.href} key={item.href} aria-current={active ? "page" : undefined}><Icon className="size-4" aria-hidden="true" />{item.label}</Link>; })}</nav><div className="mt-auto flex items-center border-t border-white/25 pt-4"><ThemeToggle /><span className="sr-only">Preferencias de apariencia</span><form action={signOut} className="ml-auto"><button className="flex h-10 items-center gap-3 px-3 text-sm text-white/75 transition-colors hover:text-paper" type="submit"><LogOut className="size-4" aria-hidden="true" />Salir</button></form></div></aside><div className="pb-20 lg:pb-0"><header className="flex h-16 items-center justify-between border-b border-line px-5 sm:px-8"><p className="text-sm text-muted">{roleLabels[viewer.role]}</p><div className="flex items-center gap-3"><span className="hidden text-right sm:block"><span className="block text-sm font-medium">{viewer.fullName ?? "Cuenta Bears"}</span><span className="block text-xs text-muted">{viewer.email}</span></span><span className="grid size-9 place-items-center rounded-full bg-sand text-sm font-medium text-ink" aria-label={viewer.fullName ?? viewer.email}>{initials}</span></div></header><main className="mx-auto w-full max-w-[1600px] p-5 sm:p-8">{children}</main></div><nav className="fixed inset-x-0 bottom-0 z-10 grid h-16 grid-cols-3 border-t border-line bg-paper lg:hidden" aria-label="Navegación móvil">{navigation.slice(0, 3).map((item) => { const Icon = item.icon; const active = item.key === activeKey; return <Link href={item.href} key={item.href} className={`grid place-items-center text-xs ${active ? "text-jade-deep" : "text-muted"}`} aria-current={active ? "page" : undefined}><span className="grid justify-items-center gap-1"><Icon className="size-5" aria-hidden="true" />{item.label}</span></Link>; })}</nav></div>;
}