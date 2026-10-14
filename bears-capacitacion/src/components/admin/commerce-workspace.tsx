"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight, BarChart3, BookOpen, Building2, Check, ChevronRight, ClipboardList,
  CloudSun, Copy, Link2, Package, Receipt, ShieldCheck, ShoppingCart, Truck,
  type LucideIcon,
} from "lucide-react";
import {
  commerceHref, commerceSections, getCommerceSection, odooQuestions,
  type CommerceSectionId,
} from "@/lib/commerce/sections";
import type { CommerceFranchise, CommerceFranchisesResult } from "@/lib/commerce/types";

const sectionIcons: Record<CommerceSectionId, LucideIcon> = {
  resumen: BarChart3, ventas: Receipt, stock: Package, recetas: BookOpen,
  pedidos: Truck, compras: ShoppingCart, rentabilidad: BarChart3,
  proyecciones: CloudSun, integracion: Link2,
};

type OperationalSectionId = Exclude<CommerceSectionId, "resumen" | "stock" | "integracion">;
type OperationalContent = {
  metrics: readonly string[];
  columns: readonly string[];
  emptyTitle: string;
  emptyDescription: string;
  requirements: readonly string[];
  note: string;
};

const operationalContent: Record<OperationalSectionId, OperationalContent> = {
  ventas: {
    metrics: ["Ventas netas", "Tickets confirmados", "Unidades vendidas", "Ticket promedio"],
    columns: ["Fecha", "Local / canal", "Producto", "Cantidad", "Venta neta"],
    emptyTitle: "Todavía no hay ventas sincronizadas",
    emptyDescription: "Aquí se consultarán las líneas de tickets por local, producto y canal, con descuentos, devoluciones y anulaciones identificados.",
    requirements: ["Identificar Punto de Venta / Restaurante y los locales en Odoo.", "Importar líneas de tickets y conciliar los totales.", "Separar ventas de salón, delivery y mayoristas sin duplicar facturación."],
    note: "Sin ventas importadas no hay totales ni un período histórico disponible. Una venta anulada no debe contarse como consumo.",
  },
  recetas: {
    metrics: ["Productos vinculados", "Recetas vigentes", "Ingredientes costeados", "Variantes configuradas"],
    columns: ["Producto / SKU", "Tipo", "Rendimiento", "Costo unitario", "Vigencia"],
    emptyTitle: "Catálogo y recetario pendientes",
    emptyDescription: "La base será un catálogo vinculado a Odoo y recetas estructuradas. El costo de un producto comprado terminado se distinguirá del costo de elaborarlo.",
    requirements: ["Vincular SKU, códigos de barras, presentaciones y unidades de medida.", "Digitalizar ingredientes, subrecetas, variantes, envases y rendimientos.", "Versionar recetas y costos para preservar el análisis histórico."],
    note: "Los gramos, mililitros y unidades deben normalizarse. Un cambio de precio actual no debe reescribir el costo de meses anteriores.",
  },
  pedidos: {
    metrics: ["Sugerencias por revisar", "Pedidos aprobados", "En preparación", "Próximas entregas"],
    columns: ["Local", "Entrega", "Productos", "Estado", "Importe"],
    emptyTitle: "Sin pedidos ni sugerencias calculadas",
    emptyDescription: "Este circuito corresponde a pedidos de franquicias a fábrica. Administración podrá revisar las necesidades antes de aprobar su emisión.",
    requirements: ["Configurar días de entrega, horarios de corte y tiempos de reposición.", "Contar con stock utilizable, ventas e ingresos confirmados.", "Definir mínimos, múltiplos, vencimientos y aprobación de pedidos."],
    note: "Pedido sugerido = demanda hasta la reposición + seguridad − stock utilizable − ingresos confirmados. No se emiten órdenes automáticamente.",
  },
  compras: {
    metrics: ["Compras a proveedores", "Recepciones pendientes", "Importe comprometido", "Necesidades de fábrica"],
    columns: ["Proveedor", "Destino", "Entrega prevista", "Estado", "Importe"],
    emptyTitle: "Sin compras sincronizadas",
    emptyDescription: "Aquí se organizará el abastecimiento de proveedores externos. Los pedidos de franquicias a fábrica tienen su propio circuito en Pedidos y reposición.",
    requirements: ["Confirmar el uso del módulo Compras y los proveedores en Odoo.", "Relacionar presentaciones, precios, impuestos y plazos de entrega.", "Conciliar órdenes, recepciones parciales y documentación."],
    note: "Comprar mercadería afecta inventario y caja; no equivale al costo de la mercadería vendida en ese período.",
  },
  rentabilidad: {
    metrics: ["Ventas netas", "Costo de mercadería vendida", "Margen bruto", "Resultado operativo"],
    columns: ["Local", "Ventas netas", "Costo vendido", "Gastos", "Resultado"],
    emptyTitle: "Rentabilidad pendiente de datos",
    emptyDescription: "El resultado distinguirá costos históricos, gastos reales y estimaciones. No se calcula rentabilidad con gastos faltantes como si fueran cero.",
    requirements: ["Conciliar ventas y costo de mercadería vendida por local.", "Definir alquiler, sueldos, servicios, impuestos y depreciación con vigencia.", "Configurar regalías y marketing como importe fijo o porcentaje con base explícita."],
    note: "Las mermas reales no se sumarán de nuevo como pérdida estimada. Fábrica, franquicia y mayoristas tendrán perspectivas de margen diferenciadas.",
  },
  proyecciones: {
    metrics: ["Demanda estimada", "Cobertura prevista", "Confianza", "Error histórico"],
    columns: ["Local / producto", "Horizonte", "Demanda estimada", "Rango probable", "Confianza"],
    emptyTitle: "Todavía no hay un pronóstico validado",
    emptyDescription: "Las proyecciones se habilitarán con histórico suficiente y mostrarán rangos, error medido y factores que expliquen cada recomendación.",
    requirements: ["Construir el histórico por día, local y producto, identificando cierres y faltantes.", "Agregar calendario, promociones y clima por ubicación.", "Validar contra semanas comparables antes de usarlo para reposición."],
    note: "Clima pendiente de proveedor y licencia comercial. Ventas cero con un producto agotado no significan demanda cero.",
  },
};

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex items-center gap-1.5 rounded-sm border border-line bg-surface px-2.5 py-1 text-xs text-muted">{children}</span>;
}

function Metric({ label, value, detail }: { label: string; value: string | number; detail: string }) {
  return <article className="border border-line bg-paper p-5">
    <p className="text-xs text-muted">{label}</p>
    <p className="mt-4 font-tabular text-3xl font-medium">{value}</p>
    <p className="mt-2 text-xs leading-5 text-muted">{detail}</p>
  </article>;
}

function Requirements({ items }: { items: readonly string[] }) {
  return <section className="border border-line bg-paper p-5 sm:p-6">
    <h2 className="flex items-center gap-2 text-sm font-medium"><ClipboardList className="size-4 text-jade" aria-hidden="true" />Qué falta para operar</h2>
    <ol className="mt-5 space-y-4">{items.map((item, index) => <li className="flex gap-3 text-sm leading-6" key={item}><span className="grid size-6 shrink-0 place-items-center rounded-full bg-surface font-tabular text-xs text-muted">{index + 1}</span><span>{item}</span></li>)}</ol>
    <Link href={commerceHref("integracion")} className="mt-6 inline-flex min-h-10 items-center gap-2 text-sm font-medium text-jade-deep dark:text-jade">Ver requisitos de Odoo<ArrowRight className="size-4" aria-hidden="true" /></Link>
  </section>;
}

function FranchiseTable({ franchises, stock = false }: { franchises: CommerceFranchise[]; stock?: boolean }) {
  return <section className="overflow-hidden border border-line bg-paper">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-5"><h2 className="font-medium">{stock ? "Inventario por local" : "Locales de la red"}</h2><Link href="/admin/franquicias" className="inline-flex min-h-9 items-center gap-2 text-sm text-jade-deep dark:text-jade">Gestionar franquicias<ArrowRight className="size-4" aria-hidden="true" /></Link></div>
    {franchises.length ? <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm">
      <thead className="bg-surface text-xs text-muted"><tr><th className="px-5 py-3 font-medium">Local</th><th className="px-5 py-3 font-medium">Estado</th><th className="px-5 py-3 font-medium">{stock ? "Stock utilizable" : "Odoo"}</th><th className="px-5 py-3 font-medium">{stock ? "Cobertura / vencimientos" : "Datos operativos"}</th></tr></thead>
      <tbody className="divide-y divide-line">{franchises.map((franchise) => <tr key={franchise.id}>
        <td className="px-5 py-4"><p className="font-medium">{franchise.name}</p><p className="mt-1 text-xs text-muted">{[franchise.city, franchise.code].filter(Boolean).join(" · ") || "Sin ciudad ni código"}</p></td>
        <td className="px-5 py-4"><Badge>{franchise.isActive ? "Activa" : "Inactiva"}</Badge></td>
        <td className="px-5 py-4 text-muted">{stock ? "Sin inventario conectado" : "Sin vincular"}</td>
        <td className="px-5 py-4 text-muted">{stock ? "No calculados" : "Pendientes de integración"}</td>
      </tr>)}</tbody>
    </table></div> : <div className="p-8 text-center"><Building2 className="mx-auto size-7 text-muted" aria-hidden="true" /><h3 className="mt-4 text-sm font-medium">No hay locales para esta selección</h3><p className="mt-2 text-sm text-muted">Cambiá los filtros o agregá una franquicia desde el gestor de locales.</p></div>}
  </section>;
}

function Overview({ franchises, filtered, available }: { franchises: CommerceFranchise[]; filtered: CommerceFranchise[]; available: boolean }) {
  return <div className="space-y-6">
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="Locales registrados" value={available ? franchises.length : "—"} detail="Fuente: franquicias de la plataforma" />
      <Metric label="Locales activos" value={available ? franchises.filter((franchise) => franchise.isActive).length : "—"} detail="Estado administrativo, no conexión a Odoo" />
      <Metric label="Locales inactivos" value={available ? franchises.filter((franchise) => !franchise.isActive).length : "—"} detail="Conservados para consulta de la red" />
      <Metric label="Datos de Odoo" value="Pendiente" detail="Sin conexión ni sincronización implementadas" />
    </div>
    <section className="border border-line bg-surface p-5 sm:p-6">
      <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 size-5 shrink-0 text-jade" aria-hidden="true" /><div><h2 className="font-medium">Primero datos confiables; después automatización</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-muted">La lista de franquicias se consulta desde la plataforma. El siguiente paso es verificar Odoo, vincular productos y locales e importar ventas e inventario. No se generan pedidos ni se calculan márgenes con información incompleta.</p></div></div>
      <Link href={commerceHref("integracion")} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-sm bg-jade px-4 text-sm font-medium text-white hover:bg-jade-deep">Preparar la conexión<ArrowRight className="size-4" aria-hidden="true" /></Link>
    </section>
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{commerceSections.filter((section) => section.id !== "resumen" && section.id !== "integracion").map((section) => {
      const Icon = sectionIcons[section.id];
      return <Link key={section.id} href={commerceHref(section.id)} className="group border border-line bg-paper p-5 transition-colors hover:border-jade"><div className="flex items-center justify-between"><Icon className="size-5 text-jade" aria-hidden="true" /><ChevronRight className="size-4 text-muted group-hover:text-jade" aria-hidden="true" /></div><h2 className="mt-5 font-medium">{section.label}</h2><p className="mt-2 text-sm leading-6 text-muted">{section.description}</p><p className="mt-4 text-xs text-muted">Pendiente de datos operativos</p></Link>;
    })}</div>
    {available ? <FranchiseTable franchises={filtered} /> : null}
  </div>;
}

function OperationalSection({ sectionId }: { sectionId: OperationalSectionId }) {
  const content = operationalContent[sectionId];
  const Icon = sectionIcons[sectionId];
  return <div className="space-y-6">
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{content.metrics.map((label) => <Metric key={label} label={label} value="—" detail="Pendiente de datos · no equivale a cero" />)}</div>
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <section className="min-w-0 overflow-hidden border border-line bg-paper">
        <div className="overflow-x-auto"><div className="flex min-w-[600px] justify-between gap-5 border-b border-line bg-surface px-5 py-3 text-xs text-muted">{content.columns.map((column) => <span key={column}>{column}</span>)}</div></div>
        <div className="px-6 py-12 text-center"><Icon className="mx-auto size-8 text-muted" aria-hidden="true" /><h2 className="mt-5 font-medium">{content.emptyTitle}</h2><p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-muted">{content.emptyDescription}</p><Badge><span className="mt-0.5">Integración pendiente</span></Badge></div>
      </section>
      <Requirements items={content.requirements} />
    </div>
    <p className="border-l-2 border-jade bg-surface px-4 py-3 text-sm leading-6 text-muted">{content.note}</p>
    {sectionId === "compras" ? <Link className="inline-flex min-h-10 items-center gap-2 text-sm text-jade-deep dark:text-jade" href={commerceHref("pedidos")}>Ir a pedidos de franquicias<ArrowRight className="size-4" aria-hidden="true" /></Link> : null}
  </div>;
}

function OdooIntegration() {
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">("idle");
  async function copyQuestions() {
    try {
      await navigator.clipboard.writeText([
        "Bears Helados — relevamiento de integración Odoo",
        ...odooQuestions.map((item, index) => `${index + 1}. ${item.title}\n${item.question}`),
        "No enviar contraseñas ni API keys en esta respuesta. Las credenciales se entregarán por un canal seguro.",
      ].join("\n\n"));
      setCopyStatus("copied");
    } catch {
      setCopyStatus("error");
    }
  }

  return <div className="space-y-6">
    <section className="grid gap-6 border border-line bg-surface p-5 sm:p-6 lg:grid-cols-3">
      <div><p className="text-xs text-muted">Estado de conexión</p><p className="mt-2 flex items-center gap-2 font-medium"><Link2 className="size-4" aria-hidden="true" />No implementada</p></div>
      <div><p className="text-xs text-muted">Última sincronización</p><p className="mt-2 text-sm">Sin registros</p></div>
      <div><p className="text-xs text-muted">Alcance inicial recomendado</p><p className="mt-2 text-sm">Solo lectura · sin emitir órdenes</p></div>
    </section>
    <section className="border border-line bg-paper p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-lg font-medium">Cuestionario para sistemas</h2><p className="mt-2 text-sm leading-6 text-muted">Compartí estas preguntas para definir la conexión antes de solicitar credenciales.</p></div><button type="button" onClick={copyQuestions} className="inline-flex min-h-11 items-center gap-2 rounded-sm border border-line px-4 text-sm hover:bg-surface">{copyStatus === "copied" ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}{copyStatus === "copied" ? "Cuestionario copiado" : "Copiar cuestionario"}</button></div>
      {copyStatus === "copied" ? <p className="mt-4 text-sm text-jade-deep dark:text-jade" role="status">Listo para enviar al responsable de sistemas.</p> : copyStatus === "error" ? <p className="mt-4 text-sm text-alert" role="alert">No pudimos copiar al portapapeles. Podés seleccionar y copiar las preguntas de esta pantalla.</p> : null}
      <ol className="mt-6 divide-y divide-line">{odooQuestions.map((item, index) => <li key={item.title} className="py-5 first:pt-0 last:pb-0"><h3 className="text-sm font-medium">{index + 1}. {item.title}</h3><p className="mt-2 text-sm leading-6">{item.question}</p><p className="mt-2 text-xs leading-5 text-muted">{item.reason}</p></li>)}</ol>
    </section>
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="border border-line bg-paper p-5 sm:p-6"><h2 className="flex items-center gap-2 font-medium"><BookOpen className="size-4 text-jade" aria-hidden="true" />Compatibilidad de API</h2><p className="mt-3 text-sm leading-6 text-muted">Odoo 19 incorpora JSON-2. Odoo 18 documenta XML-RPC. La API concreta dependerá de la versión y configuración; en Odoo Online, el acceso externo requiere el plan Custom.</p><div className="mt-4 flex flex-wrap gap-4 text-sm text-jade-deep dark:text-jade"><a href="https://www.odoo.com/documentation/19.0/developer/reference/external_api.html" target="_blank" rel="noreferrer">Documentación Odoo 19 ↗</a><a href="https://www.odoo.com/documentation/18.0/developer/reference/external_api.html" target="_blank" rel="noreferrer">Documentación Odoo 18 ↗</a></div></section>
      <section className="border border-line bg-paper p-5 sm:p-6"><h2 className="flex items-center gap-2 font-medium"><ShieldCheck className="size-4 text-jade" aria-hidden="true" />Credenciales y permisos</h2><p className="mt-3 text-sm leading-6 text-muted">No ingreses API keys en formularios generales, notas o mensajes. La conexión se implementará en el servidor con un usuario técnico de permisos mínimos. Esta pantalla no guarda credenciales ni verifica conexiones.</p><p className="mt-3 text-sm leading-6 text-muted">El módulo completo está restringido al rol administrador. Franquiciados y empleados no tienen acceso.</p></section>
    </div>
  </div>;
}

export function CommerceWorkspace({ sectionId, result }: { sectionId: CommerceSectionId; result: CommerceFranchisesResult }) {
  const router = useRouter();
  const [localId, setLocalId] = useState("all");
  const [localStatus, setLocalStatus] = useState("all");
  const section = getCommerceSection(sectionId);
  if (!section) throw new Error("Sección comercial desconocida.");
  const Icon = sectionIcons[sectionId];
  const available = result.status === "available";
  const franchises = available ? result.franchises : [];
  const filtered = franchises.filter((franchise) =>
    (localId === "all" || franchise.id === localId) &&
    (localStatus === "all" || (localStatus === "active" ? franchise.isActive : !franchise.isActive)),
  );
  const localName = franchises.find((franchise) => franchise.id === localId)?.name ?? "Toda la red";
  const showFilters = sectionId !== "integracion" && sectionId !== "recetas" && sectionId !== "compras";

  return <div className="space-y-7">
    <header>
      <p className="flex items-center gap-2 text-xs text-muted"><ShoppingCart className="size-3.5" aria-hidden="true" /><Link href={commerceHref("resumen")} className="hover:text-ink">Compras y Ventas</Link><ChevronRight className="size-3.5" aria-hidden="true" />{section.label}</p>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-[31px] font-medium leading-tight">{section.label}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted">{section.description}</p></div><Badge><ShieldCheck className="size-3.5" aria-hidden="true" />Solo administración</Badge></div>
    </header>
    <aside className="flex flex-wrap items-center justify-between gap-3 border border-line bg-sand-soft px-4 py-3 text-sm">
      <p className="flex items-start gap-2 leading-6"><Icon className="mt-1 size-4 shrink-0" aria-hidden="true" />{sectionId === "integracion" ? "Relevamiento disponible. La conexión a Odoo todavía no está implementada." : "Módulo en preparación. No hay ventas, inventario ni costos sincronizados con Odoo."}</p>
      {sectionId !== "integracion" ? <Link href={commerceHref("integracion")} className="inline-flex min-h-9 items-center gap-2 font-medium">Ver integración<ArrowRight className="size-4" aria-hidden="true" /></Link> : null}
    </aside>
    {result.status === "error" ? <div className="flex flex-wrap items-center justify-between gap-3 border border-alert/30 px-4 py-3 text-sm text-alert" role="alert"><p>{result.message}</p><button type="button" onClick={() => router.refresh()} className="min-h-10 rounded-sm border border-alert/30 px-3">Reintentar</button></div> : null}
    {showFilters && available ? <section className="flex flex-wrap items-end gap-4 border-b border-line pb-5" aria-label="Filtro de franquicias">
      <label className="grid flex-1 gap-2 text-xs text-muted" htmlFor="commerce-local">Local<select id="commerce-local" value={localId} onChange={(event) => setLocalId(event.target.value)} className="h-11 min-w-0 rounded-sm border border-line bg-paper px-3 text-sm text-ink"><option value="all">Toda la red</option>{franchises.map((franchise) => <option key={franchise.id} value={franchise.id}>{franchise.name}{franchise.isActive ? "" : " (inactiva)"}</option>)}</select></label>
      {sectionId === "resumen" || sectionId === "stock" ? <label className="grid gap-2 text-xs text-muted" htmlFor="commerce-local-status">Estado<select id="commerce-local-status" value={localStatus} onChange={(event) => setLocalStatus(event.target.value)} className="h-11 rounded-sm border border-line bg-paper px-3 text-sm text-ink"><option value="all">Todos</option><option value="active">Activas</option><option value="inactive">Inactivas</option></select></label> : <p className="pb-3 text-xs text-muted">Consulta prevista: {localName} · sin datos operativos</p>}
      <Link href="/admin/franquicias" className="inline-flex min-h-11 items-center gap-2 text-sm text-jade-deep dark:text-jade"><Building2 className="size-4" aria-hidden="true" />Gestionar locales</Link>
    </section> : null}
    {sectionId === "resumen" ? <Overview franchises={franchises} filtered={filtered} available={available} />
      : sectionId === "integracion" ? <OdooIntegration />
      : sectionId === "stock" ? <div className="space-y-6"><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{["Valor del inventario", "Productos con faltantes", "Próximos vencimientos", "Diferencias de conteo"].map((label) => <Metric key={label} label={label} value="—" detail="Sin inventario conectado · no equivale a cero" />)}</div>{available ? <FranchiseTable franchises={filtered} stock /> : null}<Requirements items={["Definir el registro oficial del stock y vincular almacenes o ubicaciones de Odoo.", "Registrar recepciones con cantidades, presentaciones, lotes y vencimientos.", "Conciliar stock teórico con conteos físicos, mermas y devoluciones."]} /><p className="border-l-2 border-jade bg-surface px-4 py-3 text-sm leading-6 text-muted">El código de barras identifica el producto, no la cantidad recibida. El stock utilizable deberá descontar productos vencidos, dañados o reservados.</p></div>
      : <OperationalSection sectionId={sectionId} />}
  </div>;
}
