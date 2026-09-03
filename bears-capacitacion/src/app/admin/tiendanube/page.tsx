import { Link2, ShieldCheck } from "lucide-react";
import { PortalLayout } from "@/components/portal/portal-layout";
import { requireSuperAdmin } from "@/lib/auth/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import { isTiendanubeConfigured } from "@/lib/tiendanube/config";

export const dynamic = "force-dynamic";

type Connection = {
  connectedAt: string | null;
  lastSyncStatus: string;
  lastSyncedAt: string | null;
  status: string;
  storeId: string;
  webhookRegisteredAt: string | null;
};

const resultMessages: Record<string, { message: string; tone: "alert" | "success" | "warning" }> = {
  "authorization-failed": { tone: "alert", message: "Tiendanube no confirmó la autorización. No se guardó ninguna credencial." },
  connected: { tone: "success", message: "La tienda quedó autorizada. La sincronización inicial se procesará en segundo plano." },
  "connected-without-sync": { tone: "warning", message: "La tienda quedó autorizada, pero la sincronización inicial necesita reintentarse." },
  "invalid-request": { tone: "alert", message: "La respuesta de autorización no es válida." },
  "invalid-state": { tone: "alert", message: "La autorización venció o ya fue utilizada. Iniciá el proceso nuevamente." },
  "storage-error": { tone: "alert", message: "No se pudo guardar la conexión de Tiendanube." },
  unauthorized: { tone: "alert", message: "La autorización requiere una sesión activa de superadministración." },
};

function dateLabel(value: string | null) {
  if (!value) return "Sin registro";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Sin registro" : new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

async function getConnections(): Promise<Connection[] | null> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("tiendanube_connections")
      .select("store_id, status, connected_at, last_synced_at, last_sync_status, webhook_registered_at")
      .order("connected_at", { ascending: false });
    if (error || !data) return null;

    return data.flatMap((connection) => {
      if (!/^\d+$/.test(connection.store_id)) return [];
      return [{
        storeId: connection.store_id,
        status: connection.status,
        connectedAt: connection.connected_at,
        lastSyncedAt: connection.last_synced_at,
        lastSyncStatus: connection.last_sync_status,
        webhookRegisteredAt: connection.webhook_registered_at,
      }];
    });
  } catch {
    return null;
  }
}

export default async function TiendanubePage({ searchParams }: { searchParams: Promise<{ result?: string | string[] }> }) {
  const viewer = await requireSuperAdmin();
  const [parameters, connections] = await Promise.all([searchParams, getConnections()]);
  const result = Array.isArray(parameters.result) ? parameters.result[0] : parameters.result;
  const notice = result ? resultMessages[result] : null;
  const configured = isTiendanubeConfigured();
  const hasConnectedStore = connections?.some((connection) => connection.status === "connected") ?? false;

  return <PortalLayout viewer={viewer} activeKey="tiendanube"><section className="max-w-5xl"><header className="flex flex-wrap items-end justify-between gap-5"><div><p className="text-xs text-muted">Canal comercial</p><h1 className="mt-2 text-[31px] font-medium leading-tight">Tiendanube</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted">Autorizaciones, sincronización y permisos comerciales de tiendas Bears.</p></div>{configured && connections !== null ? <form action="/api/tiendanube/connect" method="post"><button className="flex h-11 items-center gap-2 rounded-sm bg-jade px-4 text-sm font-medium text-white transition-colors hover:bg-jade-deep" type="submit"><Link2 className="size-4" aria-hidden="true" />{hasConnectedStore ? "Reautorizar tienda" : "Autorizar tienda"}</button></form> : null}</header>{notice ? <p className={`mt-6 rounded-sm px-3 py-2 text-sm ${notice.tone === "success" ? "bg-[#E0F1EB] text-jade-deep" : notice.tone === "warning" ? "bg-sand-soft text-ink" : "bg-[#FCEAE6] text-alert"}`} role="status">{notice.message}</p> : null}{!configured ? <section className="mt-8 border border-line bg-paper p-5 sm:p-6"><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-sm bg-surface text-muted"><ShieldCheck className="size-4" aria-hidden="true" /></span><p className="text-sm font-medium">Configuración pendiente</p></div><p className="mt-4 max-w-xl text-sm leading-6 text-muted">Antes de autorizar una tienda, configurá las credenciales de la aplicación, el origen público y el cifrado de tokens en el entorno seguro.</p></section> : connections === null ? <section className="mt-8 border border-line bg-paper p-5 sm:p-6"><p className="text-sm font-medium">Base comercial pendiente</p><p className="mt-2 max-w-xl text-sm leading-6 text-muted">La configuración está lista, pero todavía falta aplicar la migración de Tiendanube antes de autorizar una tienda.</p></section> : !connections.length ? <section className="mt-8 border border-line bg-paper p-5 sm:p-6"><p className="text-sm font-medium">Sin tiendas autorizadas</p><p className="mt-2 max-w-xl text-sm leading-6 text-muted">La autorización solicita únicamente lectura de productos y pedidos. El acceso se cifra antes de guardarse y nunca se muestra en esta pantalla.</p></section> : <section className="mt-8 divide-y divide-line border border-line bg-paper">{connections.map((connection) => <article className="p-5 sm:p-6" key={connection.storeId}><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-medium">Tienda {connection.storeId}</p><p className="mt-1 text-sm text-muted">Autorizada {dateLabel(connection.connectedAt)}</p></div><span className={`inline-flex rounded-sm px-2 py-1 text-xs font-medium ${connection.status === "connected" ? "bg-[#E0F1EB] text-jade-deep" : connection.status === "error" || connection.status === "revoked" ? "bg-[#FCEAE6] text-alert" : "bg-sand-soft text-ink"}`}>{connection.status === "connected" ? "Conectada" : connection.status === "revoked" ? "Revocada" : connection.status === "error" ? "Requiere atención" : "Sin conexión"}</span></div><dl className="mt-5 grid gap-4 border-t border-line pt-5 text-sm sm:grid-cols-3"><div><dt className="text-xs text-muted">Sincronización</dt><dd className="mt-1 font-medium">{connection.lastSyncStatus === "succeeded" ? "Actualizada" : connection.lastSyncStatus === "queued" ? "En cola" : connection.lastSyncStatus === "running" ? "En proceso" : connection.lastSyncStatus === "failed" ? "Requiere atención" : "Sin actividad"}</dd></div><div><dt className="text-xs text-muted">Última actualización</dt><dd className="mt-1 font-medium">{dateLabel(connection.lastSyncedAt)}</dd></div><div><dt className="text-xs text-muted">Webhooks</dt><dd className="mt-1 font-medium">{connection.webhookRegisteredAt ? "Registrados" : "Pendientes"}</dd></div></dl></article>)}</section>}</section></PortalLayout>;
}