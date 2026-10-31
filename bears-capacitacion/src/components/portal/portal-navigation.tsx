"use client";

import Link from "next/link";
import {
  BarChart3, BookOpen, Building2, FileText,
  LayoutDashboard, Menu, Sparkles, Users, type LucideIcon,
} from "lucide-react";
import type { AppRole } from "@/lib/auth/roles";

type NavigationItem = { href: string; label: string; icon: LucideIcon; key: string };

const navigationByRole: Record<AppRole, NavigationItem[]> = {
  admin: [
    { href: "/admin/dashboard", label: "Resumen", icon: LayoutDashboard, key: "dashboard" },
    { href: "/admin/usuarios", label: "Usuarios", icon: Users, key: "users" },
    { href: "/admin/cursos", label: "Cursos", icon: BookOpen, key: "courses" },
    { href: "/admin/manuales", label: "Manuales", icon: FileText, key: "manuals" },
    { href: "/admin/franquicias", label: "Franquicias", icon: Building2, key: "franchises" },
    { href: "/admin/ia", label: "Bot IA", icon: Sparkles, key: "ai" },
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

function NavigationLinks({ role, activeKey, mobile = false }: { role: AppRole; activeKey: string; mobile?: boolean }) {
  const activeClass = mobile ? "bg-surface text-jade-deep dark:text-jade" : "bg-paper text-ink";
  const idleClass = mobile ? "text-ink hover:bg-surface" : "text-white/85 hover:bg-white/15 hover:text-paper";

  return <>
    {navigationByRole[role].map((item) => {
      const Icon = item.icon;
      const active = item.key === activeKey;
      return <Link className={`flex min-h-11 items-center gap-3 rounded-sm px-3 text-sm transition-colors ${active ? activeClass : idleClass}`} href={item.href} key={item.href} aria-current={active ? "page" : undefined}>
        <Icon className="size-4 shrink-0" aria-hidden="true" />{item.label}
      </Link>;
    })}
  </>;
}

export function PortalNavigation({ role, activeKey }: { role: AppRole; activeKey: string }) {
  return <nav className="mt-3 min-h-0 flex-1 space-y-1 overflow-y-auto pb-5" aria-label="Navegación principal"><NavigationLinks role={role} activeKey={activeKey} /></nav>;
}

export function PortalMobileNavigation({ role, activeKey }: { role: AppRole; activeKey: string }) {
  const navigation = navigationByRole[role];
  const hasMenu = navigation.length > 2;
  const menuActive = !navigation.slice(0, 2).some((item) => item.key === activeKey);

  return <nav className={`fixed inset-x-0 bottom-0 z-20 grid h-16 border-t border-line bg-paper lg:hidden ${hasMenu ? "grid-cols-3" : "grid-cols-2"}`} aria-label="Navegación móvil">
    {navigation.slice(0, 2).map((item) => {
      const Icon = item.icon;
      const active = item.key === activeKey;
      return <Link href={item.href} key={item.href} className={`grid place-items-center text-xs ${active ? "text-jade-deep dark:text-jade" : "text-muted"}`} aria-current={active ? "page" : undefined}><span className="grid justify-items-center gap-1"><Icon className="size-5" aria-hidden="true" />{item.label}</span></Link>;
    })}
    {hasMenu ? <details key={activeKey}>
      <summary className={`grid h-full cursor-pointer list-none place-items-center text-xs [&::-webkit-details-marker]:hidden ${menuActive ? "text-jade-deep dark:text-jade" : "text-muted"}`}><span className="grid justify-items-center gap-1"><Menu className="size-5" aria-hidden="true" />Menú</span></summary>
      <div className="absolute inset-x-0 bottom-full max-h-[70dvh] overflow-y-auto border-t border-line bg-paper p-4 shadow-lg">
        <p className="mb-3 px-3 text-xs font-medium text-muted">Navegación del panel</p>
        <NavigationLinks role={role} activeKey={activeKey} mobile />
      </div>
    </details> : null}
  </nav>;
}
