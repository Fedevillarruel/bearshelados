import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { LogOut } from "lucide-react";
import { signOut } from "@/app/actions/auth";
import { defaultRouteForRole, getViewer, type AppRole, type Viewer } from "@/lib/auth/roles";
import { AdminViewSelector, type ViewOption } from "@/components/portal/admin-view-selector";
import { createClient } from "@/lib/supabase/server";
import { isPreviewRole } from "@/lib/auth/preview";
import { ThemeToggle } from "@/components/portal/theme-toggle";
import { PortalMobileNavigation, PortalNavigation } from "@/components/portal/portal-navigation";

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

export async function PortalLayout({ viewer, activeKey, children }: PortalLayoutProps) {
  const actor = await getViewer();
  const users: ViewOption[] = [];
  if (actor?.role === "admin") {
    const supabase = await createClient();
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase.from("profiles")
        .select("id, email, role").eq("is_active", true).in("role", ["empleado", "franquiciado"])
        .order("email").order("id").range(offset, offset + 999);
      if (error) throw new Error("No pudimos cargar los usuarios del selector de vista.");
      for (const profile of data ?? []) {
        if (isPreviewRole(profile.role)) users.push({ id: profile.id, email: profile.email, role: profile.role });
      }
      if (!data || data.length < 1000) break;
    }
  }
  const initials = (viewer.fullName ?? viewer.email).split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen bg-paper lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      <aside className="hidden bg-jade-deep px-4 py-5 text-paper lg:flex lg:flex-col">
        <Link href={defaultRouteForRole(viewer.role)} className="flex h-12 shrink-0 items-center gap-3 px-2">
          <span className="grid size-9 place-items-center rounded-sm bg-paper p-1"><Image src="https://dolltmxtcoawmpltsnrk.supabase.co/storage/v1/object/public/logo/lKkmRZZESHaaJgzufeQk_k9T3668M10wqK2R0.webp" alt="Bears Helados" width={28} height={28} className="max-h-full max-w-full object-contain" /></span>
          <span className="text-sm font-medium">Bears Helados</span>
        </Link>
        <p className="mt-10 shrink-0 px-2 text-xs text-white/70">{roleLabels[viewer.role]}</p>
        <PortalNavigation role={viewer.role} activeKey={activeKey} />
        <div className="mt-auto flex shrink-0 items-center border-t border-white/25 pt-4">
          <ThemeToggle /><span className="sr-only">Preferencias de apariencia</span>
          <form action={signOut} className="ml-auto"><button className="flex h-10 items-center gap-3 px-3 text-sm text-white/75 transition-colors hover:text-paper" type="submit"><LogOut className="size-4" aria-hidden="true" />Salir</button></form>
        </div>
      </aside>
      <div className="min-w-0 pb-20 lg:pb-0">
        <header className="flex h-16 items-center justify-between border-b border-line px-5 sm:px-8">
          <p className="hidden text-sm text-muted sm:block">{roleLabels[viewer.role]}</p>
          <div className="ml-auto flex min-w-0 items-center gap-3">{actor?.role === "admin" ? <AdminViewSelector users={users} selectedId={viewer.previewAdminId ? viewer.id : null} /> : null}<span className="hidden text-right sm:block"><span className="block text-sm font-medium">{viewer.fullName ?? "Cuenta Bears"}</span><span className="block text-xs text-muted">{viewer.email}</span></span><span className="grid size-9 shrink-0 place-items-center rounded-full bg-sand text-sm font-medium text-ink" aria-label={viewer.fullName ?? viewer.email}>{initials}</span></div>
        </header>
        {viewer.previewAdminId ? <p role="status" className="border-b border-line bg-sand px-5 py-3 text-sm sm:px-8">Vista de {viewer.email} · Solo lectura. No se modifican sus avances ni evaluaciones.</p> : null}
        <main className="mx-auto w-full max-w-[1600px] p-5 sm:p-8">{children}</main>
      </div>
      <PortalMobileNavigation role={viewer.role} activeKey={activeKey} />
    </div>
  );
}