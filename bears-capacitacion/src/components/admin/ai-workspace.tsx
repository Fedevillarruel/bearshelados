"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  Activity, ArrowDownLeft, ArrowUpRight, Bot, Check, CircleAlert, Clock3,
  Camera, ExternalLink, FileText, LoaderCircle, MessageCircle, MessageSquareText,
  Plus, RefreshCw, Send, ShieldCheck, Sparkles, Trash2, UserRound, X,
} from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Toaster, toast } from "sonner";
import {
  defaultBotSettings, type AIWorkspaceData, type BotMessage, type BotSettings,
  type Conversation, type KnowledgeCategory, type KnowledgeEntry, type SocialAsset,
} from "@/lib/ai/types";
import { aiSections, type AISection } from "@/lib/ai/sections";

type KnowledgeDraft = Omit<KnowledgeEntry, "id"> & { id?: string };
type PlaygroundMessage = { role: "user" | "assistant"; content: string; handoff?: boolean };
type MetaPage = { id: string; name: string; instagramId: string | null };

const categories: { value: KnowledgeCategory; label: string }[] = [
  { value: "general", label: "General" },
  { value: "faq", label: "Preguntas frecuentes" },
  { value: "horarios", label: "Horarios" },
  { value: "eventos", label: "Eventos" },
  { value: "talleres", label: "Talleres" },
  { value: "cumpleanos", label: "Cumpleaños" },
  { value: "productos", label: "Productos" },
];

const inputClass = "h-11 w-full rounded-sm border border-line bg-paper px-3 text-sm text-ink placeholder:text-muted";
const textAreaClass = "min-h-28 w-full rounded-sm border border-line bg-paper px-3 py-2.5 text-sm leading-6 text-ink placeholder:text-muted";
const buttonClass = "inline-flex min-h-10 items-center justify-center gap-2 rounded-sm border border-line bg-paper px-3 text-sm font-medium text-ink transition-colors hover:bg-surface disabled:cursor-not-allowed disabled:opacity-55";
const primaryButtonClass = "inline-flex min-h-10 items-center justify-center gap-2 rounded-sm bg-jade px-4 text-sm font-medium text-white transition-colors hover:bg-jade-deep disabled:cursor-not-allowed disabled:opacity-55";

function getErrorMessage(payload: unknown, fallback: string) {
  if (typeof payload === "object" && payload !== null && "error" in payload && typeof payload.error === "string") return payload.error;
  return fallback;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: "no-store", headers: { ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers } });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(getErrorMessage(payload, `No se pudo completar la solicitud (${response.status}).`));
  return payload as T;
}

function dateLabel(value: string, includeTime = false) {
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value);
  if (Number.isNaN(date.getTime())) return "Fecha no disponible";
  return new Intl.DateTimeFormat("es-AR", includeTime
    ? { dateStyle: "medium", timeStyle: "short" }
    : { dateStyle: "medium" }).format(date);
}

function EmptyState({ icon: Icon, title, description, action }: { icon: typeof FileText; title: string; description: string; action?: ReactNode }) {
  return <div className="grid min-h-52 place-items-center border border-dashed border-line bg-surface/50 p-6 text-center">
    <div className="max-w-md">
      <span className="mx-auto grid size-11 place-items-center rounded-full bg-paper text-muted"><Icon className="size-5" aria-hidden="true" /></span>
      <h3 className="mt-4 text-sm font-medium">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-muted">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  </div>;
}

function SectionHeading({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return <header className="flex flex-wrap items-end justify-between gap-4">
    <div>{eyebrow ? <p className="text-xs font-medium uppercase tracking-wide text-muted">{eyebrow}</p> : null}
      <h2 className={`${eyebrow ? "mt-1" : ""} text-xl font-medium tracking-tight`}>{title}</h2>
      {description ? <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">{description}</p> : null}
    </div>
    {action}
  </header>;
}

function StatusPill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "good" | "warning" | "bad" }) {
  const colors = {
    neutral: "bg-surface text-muted",
    good: "bg-[#E0F1EB] text-jade-deep",
    warning: "bg-sand-soft text-ink",
    bad: "bg-[#FCEAE6] text-alert",
  };
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${colors[tone]}`}>{children}</span>;
}

function MetricCard({ label, value, detail, icon: Icon, accent = false }: { label: string; value: number; detail: string; icon: typeof Activity; accent?: boolean }) {
  return <article className="border border-line bg-paper p-4 sm:p-5">
    <div className="flex items-start justify-between gap-3">
      <div><p className="text-sm text-muted">{label}</p><p className="mt-3 font-tabular text-3xl font-medium tracking-tight">{value.toLocaleString("es-AR")}</p></div>
      <span className={`grid size-9 place-items-center rounded-sm ${accent ? "bg-jade-deep text-white" : "bg-surface text-muted"}`}><Icon className="size-4" aria-hidden="true" /></span>
    </div>
    <p className="mt-3 text-xs leading-5 text-muted">{detail}</p>
  </article>;
}

const initialKnowledge: KnowledgeDraft = {
  title: "", content: "", category: "general", franchiseId: null, url: "",
  enabled: true, validFrom: null, validUntil: null,
};

export function AIWorkspace({ tab = "resumen" }: { tab?: AISection }) {
  const [data, setData] = useState<AIWorkspaceData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<7 | 30 | 90>(30);
  const [pending, setPending] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(null);
  const [settings, setSettings] = useState<BotSettings>(defaultBotSettings);
  const [draft, setDraft] = useState<KnowledgeDraft>(initialKnowledge);
  const [editingKnowledge, setEditingKnowledge] = useState(false);
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [conversationMessages, setConversationMessages] = useState<BotMessage[]>([]);
  const [conversationStatus, setConversationStatus] = useState<"bot" | "human">("bot");
  const [humanReply, setHumanReply] = useState("");
  const [playgroundMessages, setPlaygroundMessages] = useState<PlaygroundMessage[]>([]);
  const [playgroundInput, setPlaygroundInput] = useState("");
  const [metaPages, setMetaPages] = useState<MetaPage[]>([]);
  const [selectedPageId, setSelectedPageId] = useState("");
  const [metaNotice, setMetaNotice] = useState<string | null>(null);

  const refresh = useCallback(async (days: 7 | 30 | 90 = 30) => {
    setLoading(true);
    setLoadError(null);
    try {
      const next = await requestJson<AIWorkspaceData>(`/api/ai/workspace?days=${days}`);
      setData(next);
      setSettings(next.settings);
      setPeriod(days);
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo cargar el espacio de IA.";
      setLoadError(message);
      setNotice({ tone: "error", text: message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(30); }, [refresh]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const metaResult = params.get("meta");
    if (metaResult === "connected") {
      setMetaNotice("Autorización recibida. Elegí la página oficial de Bears para finalizar la conexión.");
      void requestJson<{ pages: MetaPage[] }>("/api/meta/pages").then(({ pages }) => {
        setMetaPages(pages);
        if (pages.length === 1) setSelectedPageId(pages[0].id);
      }).catch((error: unknown) => setNotice({ tone: "error", text: error instanceof Error ? error.message : "No se pudieron cargar las páginas autorizadas." }));
    } else if (metaResult === "select") {
      void requestJson<{ pages: MetaPage[] }>("/api/meta/pages").then(({ pages }) => {
        setMetaPages(pages);
        if (pages.length === 1) setSelectedPageId(pages[0].id);
      }).catch((error: unknown) => setNotice({ tone: "error", text: error instanceof Error ? error.message : "No se pudieron cargar las páginas autorizadas." }));
    } else if (metaResult === "error") {
      setMetaNotice("Meta no pudo completar la autorización. Revisá la configuración e intentá nuevamente.");
    }
  }, []);

  const readiness = useMemo(() => {
    if (!data) return { canEnable: false, reasons: [] as string[], currentKnowledgeCount: 0 };
    const today = new Date().toISOString().slice(0, 10);
    const currentKnowledgeCount = data.knowledge.filter((entry) => entry.enabled
      && (!entry.validFrom || entry.validFrom <= today)
      && (!entry.validUntil || entry.validUntil >= today)).length;
    const hasCurrentKnowledge = currentKnowledgeCount > 0;
    const reasons = [
      ...(!data.readiness.openai ? ["Falta OPENAI_API_KEY"] : []),
      ...(!data.readiness.meta ? ["Faltan las variables de configuración de Meta"] : []),
      ...(!data.connection ? ["Conectá la página de Bears"] : []),
      ...(!hasCurrentKnowledge ? ["Agregá conocimiento vigente y habilitado"] : []),
    ];
    return { canEnable: reasons.length === 0, reasons, currentKnowledgeCount };
  }, [data]);

  const activeKnowledgeCount = readiness.currentKnowledgeCount;
  const currentConversation = data?.conversations.find((conversation) => conversation.id === selectedConversation) ?? null;

  function announce(text: string, tone: "success" | "error" | "info" = "success") {
    setNotice({ text, tone });
    if (tone === "success") toast.success(text);
    else if (tone === "error") toast.error(text);
    else toast(text);
  }

  async function loadConversation(id: string) {
    setSelectedConversation(id);
    setConversationMessages([]);
    setPending("conversation-load");
    try {
      const result = await requestJson<{ conversation: Conversation; messages: BotMessage[] }>(`/api/ai/conversations?id=${encodeURIComponent(id)}`);
      setConversationMessages(result.messages);
      setConversationStatus(result.conversation.status);
    } catch (error) {
      announce(error instanceof Error ? error.message : "No se pudo abrir la conversación.", "error");
    } finally {
      setPending(null);
    }
  }

  async function updateConversationStatus(status: "bot" | "human") {
    if (!selectedConversation) return;
    setPending("takeover");
    try {
      await requestJson("/api/ai/conversations", { method: "PATCH", body: JSON.stringify({ id: selectedConversation, status }) });
      setConversationStatus(status);
      await refresh(period);
      announce(status === "human" ? "Tomaste el control de la conversación." : "La conversación volvió a la atención del bot.");
    } catch (error) {
      announce(error instanceof Error ? error.message : "No se pudo actualizar la conversación.", "error");
    } finally {
      setPending(null);
    }
  }

  async function sendHumanReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedConversation || !humanReply.trim()) return;
    setPending("human-reply");
    try {
      await requestJson("/api/ai/conversations", { method: "POST", body: JSON.stringify({ id: selectedConversation, message: humanReply.trim() }) });
      setHumanReply("");
      await loadConversation(selectedConversation);
      await refresh(period);
      announce("Respuesta enviada.");
    } catch (error) {
      announce(error instanceof Error ? error.message : "No se pudo enviar la respuesta.", "error");
    } finally {
      setPending(null);
    }
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending("settings");
    try {
      await requestJson("/api/ai/workspace", { method: "PATCH", body: JSON.stringify({ settings }) });
      await refresh(period);
      announce("La configuración quedó guardada.");
    } catch (error) {
      announce(error instanceof Error ? error.message : "No se pudo guardar la configuración.", "error");
    } finally {
      setPending(null);
    }
  }

  async function toggleBot(enabled: boolean) {
    if (enabled && !readiness.canEnable) {
      announce("Completá los requisitos antes de activar el bot.", "error");
      return;
    }
    setPending("bot-toggle");
    const next = { ...settings, enabled };
    try {
      await requestJson("/api/ai/workspace", { method: "PATCH", body: JSON.stringify({ settings: next }) });
      setSettings(next);
      await refresh(period);
      announce(enabled ? "El bot quedó activado." : "El bot quedó pausado.");
    } catch (error) {
      announce(error instanceof Error ? error.message : "No se pudo cambiar el estado del bot.", "error");
    } finally {
      setPending(null);
    }
  }

  async function saveKnowledge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending("knowledge");
    try {
      await requestJson("/api/ai/workspace", { method: "POST", body: JSON.stringify({ entry: draft }) });
      setDraft(initialKnowledge);
      setEditingKnowledge(false);
      await refresh(period);
      announce(draft.id ? "Ficha actualizada." : "Ficha agregada.");
    } catch (error) {
      announce(error instanceof Error ? error.message : "No se pudo guardar la ficha.", "error");
    } finally {
      setPending(null);
    }
  }

  async function deleteKnowledge(id: string) {
    if (!window.confirm("¿Eliminar esta ficha de conocimiento? Esta acción no se puede deshacer.")) return;
    setPending(`delete-${id}`);
    try {
      await requestJson("/api/ai/workspace", { method: "DELETE", body: JSON.stringify({ id }) });
      await refresh(period);
      announce("Ficha eliminada.");
    } catch (error) {
      announce(error instanceof Error ? error.message : "No se pudo eliminar la ficha.", "error");
    } finally {
      setPending(null);
    }
  }

  async function importText(file: File | undefined) {
    if (!file) return;
    if (!/\.(txt|md)$/i.test(file.name)) {
      announce("Elegí un archivo .txt o .md.", "error");
      return;
    }
    if (file.size > 20_000) {
      announce("El archivo puede pesar hasta 20 KB.", "error");
      return;
    }
    try {
      const content = await file.text();
      setDraft((current) => ({ ...current, title: current.title || file.name.replace(/\.(txt|md)$/i, ""), content }));
      setEditingKnowledge(true);
      announce("Texto importado. Revisá la ficha antes de guardarla.", "info");
    } catch {
      announce("No se pudo leer el archivo seleccionado.", "error");
    }
  }

  async function runPlayground(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = playgroundInput.trim();
    if (!message) return;
    const history = playgroundMessages.slice(-20).map(({ role, content }) => ({ role, content }));
    const nextMessages: PlaygroundMessage[] = [...playgroundMessages, { role: "user", content: message }];
    setPlaygroundMessages(nextMessages);
    setPlaygroundInput("");
    setPending("playground");
    try {
      const result = await requestJson<{ reply: string; handoff: boolean }>("/api/ai/playground", {
        method: "POST", body: JSON.stringify({ message, history }),
      });
      setPlaygroundMessages([...nextMessages, { role: "assistant", content: result.reply, handoff: result.handoff }]);
    } catch (error) {
      setPlaygroundMessages(playgroundMessages);
      setPlaygroundInput(message);
      announce(error instanceof Error ? error.message : "No se pudo generar una respuesta de prueba.", "error");
    } finally {
      setPending(null);
    }
  }

  async function disconnectMeta() {
    if (!window.confirm("¿Desconectar Meta? El bot se pausará y se eliminarán las credenciales guardadas.")) return;
    setPending("disconnect");
    try {
      await requestJson("/api/meta/connect", { method: "DELETE" });
      await refresh(period);
      setMetaPages([]);
      announce("La conexión de Meta se desconectó.");
    } catch (error) {
      announce(error instanceof Error ? error.message : "No se pudo desconectar Meta.", "error");
      await refresh(period);
    } finally {
      setPending(null);
    }
  }

  async function finalizeMetaConnection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedPageId) return;
    setPending("connect-page");
    try {
      await requestJson("/api/meta/pages", { method: "POST", body: JSON.stringify({ pageId: selectedPageId }) });
      setMetaPages([]);
      setMetaNotice(null);
      await refresh(period);
      announce("La página de Bears quedó conectada.");
    } catch (error) {
      announce(error instanceof Error ? error.message : "No se pudo conectar la página.", "error");
    } finally {
      setPending(null);
    }
  }

  async function syncSocial() {
    setPending("sync");
    try {
      await requestJson("/api/meta/sync", { method: "POST" });
      await refresh(period);
      announce("La actividad social se actualizó.");
    } catch (error) {
      announce(error instanceof Error ? error.message : "No se pudo actualizar la actividad social.", "error");
    } finally {
      setPending(null);
    }
  }

  const chartData = useMemo(() => (data?.metrics.daily ?? []).map((day) => ({
    ...day,
    shortDate: new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short" }).format(new Date(`${day.date}T12:00:00`)),
  })), [data?.metrics.daily]);

  return <div className="space-y-6">
    <Toaster position="top-right" richColors />
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-jade-deep">Asistente Bears</p>
        <div className="mt-2 flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-sm bg-jade-deep text-white"><Bot className="size-6" aria-hidden="true" /></span>
          <div><h1 className="text-2xl font-medium tracking-tight sm:text-3xl">Espacio de IA</h1><p className="mt-1 text-sm text-muted">Atención, conocimiento y actividad de los canales de Bears.</p></div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {data ? <StatusPill tone={settings.enabled ? "good" : "warning"}>{settings.enabled ? <><span className="size-1.5 rounded-full bg-jade-deep" />Bot activo</> : <><span className="size-1.5 rounded-full bg-[#9a7520]" />Bot pausado</>}</StatusPill> : null}
        <button type="button" className={buttonClass} onClick={() => void refresh(period)} disabled={loading}><RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />Actualizar</button>
      </div>
    </header>

    {notice ? <div role={notice.tone === "error" ? "alert" : "status"} className={`flex items-start justify-between gap-3 border px-4 py-3 text-sm ${notice.tone === "error" ? "border-[#efc5bb] bg-[#FCEAE6] text-alert" : notice.tone === "success" ? "border-[#b8dfd0] bg-[#E0F1EB] text-jade-deep" : "border-line bg-surface text-ink"}`}>
      <span className="flex items-start gap-2"><CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{notice.text}</span>
      <button type="button" aria-label="Cerrar aviso" onClick={() => setNotice(null)}><X className="size-4" aria-hidden="true" /></button>
    </div> : null}

    {loading && !data ? <div className="grid min-h-72 place-items-center border border-line bg-paper"><p className="flex items-center gap-3 text-sm text-muted"><LoaderCircle className="size-5 animate-spin" aria-hidden="true" />Cargando el espacio de IA…</p></div> : loadError && !data ? <EmptyState icon={CircleAlert} title="No se pudo cargar el espacio" description={loadError} action={<button type="button" className={primaryButtonClass} onClick={() => void refresh(period)}><RefreshCw className="size-4" aria-hidden="true" />Reintentar</button>} /> : data ? <section aria-label={aiSections.find((section) => section.id === tab)?.label} className="min-w-0">
      {tab === "resumen" ? <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><h2 className="text-xl font-medium">Rendimiento del asistente</h2><p className="mt-1 text-sm text-muted">Actividad registrada en los canales conectados.</p></div>
          <label className="flex items-center gap-2 text-sm text-muted">Período<select aria-label="Período de métricas" className={`${inputClass} h-10 w-auto min-w-32`} value={period} onChange={(event) => void refresh(Number(event.target.value) as 7 | 30 | 90)}><option value={7}>7 días</option><option value={30}>30 días</option><option value={90}>90 días</option></select></label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Conversaciones" value={data.metrics.conversations} detail={`Total del período seleccionado: ${period} días`} icon={MessageCircle} accent />
          <MetricCard label="Mensajes recibidos" value={data.metrics.incoming} detail={`Total del período seleccionado: ${period} días`} icon={ArrowDownLeft} />
          <MetricCard label="Respuestas enviadas" value={data.metrics.replies} detail={`Total del período seleccionado: ${period} días`} icon={ArrowUpRight} />
          <MetricCard label="Chats en atención humana" value={data.metrics.handoffs} detail="Estado actual de chats con actividad en el período" icon={UserRound} />
        </div>
        <p className="border-l-2 border-sand bg-sand-soft px-4 py-3 text-sm leading-6 text-ink">Estas métricas reflejan conversaciones y mensajes, no ventas ni ingresos verificados.</p>
        <p className="text-xs leading-5 text-muted">Las métricas de conversaciones y mensajes cubren todo el período seleccionado; hay {data.metrics.failed} mensajes con error de entrega. La atención humana incluye todos los chats con actividad en ese período, no solo los últimos 100 de la bandeja.</p>
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(280px,0.8fr)]">
          <section className="border border-line bg-paper p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3"><div><h3 className="text-sm font-medium">Conversaciones por día</h3><p className="mt-1 text-xs text-muted">Mensajes recibidos y respuestas</p></div><StatusPill>{period} días</StatusPill></div>
            {chartData.length ? <div className="mt-5 h-64 min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="shortDate" tick={{ fill: "var(--muted)", fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={20} />
                  <YAxis allowDecimals={false} tick={{ fill: "var(--muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: "var(--surface)" }} contentStyle={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 2, color: "var(--ink)" }} />
                  <Bar dataKey="incoming" name="Recibidos" fill="#339576" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="replies" name="Respuestas" fill="#eed683" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div> : <div className="mt-5"><EmptyState icon={Activity} title="Todavía no hay actividad" description="Cuando el asistente registre mensajes durante este período, vas a ver la evolución acá." /></div>}
            <div className="mt-3 flex gap-4 text-xs text-muted"><span className="inline-flex items-center gap-2"><span className="size-2 rounded-full bg-jade" />Recibidos</span><span className="inline-flex items-center gap-2"><span className="size-2 rounded-full bg-sand" />Respuestas</span></div>
          </section>
          <section className="border border-line bg-paper p-4 sm:p-5">
            <h3 className="text-sm font-medium">Temas frecuentes</h3><p className="mt-1 text-xs text-muted">Según las consultas recibidas</p>
            {data.metrics.topics.length ? <ol className="mt-4 divide-y divide-line">{data.metrics.topics.map((topic, index) => <li className="flex items-center gap-3 py-3" key={topic.topic}><span className="grid size-7 shrink-0 place-items-center rounded-full bg-surface text-xs text-muted">{index + 1}</span><span className="min-w-0 flex-1 truncate text-sm">{topic.topic}</span><span className="font-tabular text-sm text-muted">{topic.count}</span></li>)}</ol> : <div className="mt-4"><EmptyState icon={MessageCircle} title="Sin temas identificados" description="Los temas aparecen cuando haya consultas suficientes para agrupar." /></div>}
          </section>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <article className="flex items-center justify-between gap-4 border border-line bg-paper p-4"><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-sm bg-surface text-muted"><ShieldCheck className="size-4" aria-hidden="true" /></span><div><h3 className="text-sm font-medium">Preparación del asistente</h3><p className="mt-1 text-xs text-muted">{activeKnowledgeCount} fichas habilitadas</p></div></div><StatusPill tone={readiness.canEnable ? "good" : "warning"}>{readiness.canEnable ? "Listo para activar" : "Configuración incompleta"}</StatusPill></article>
          <article className="flex items-center justify-between gap-4 border border-line bg-paper p-4"><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-sm bg-surface text-muted"><Camera className="size-4" aria-hidden="true" /></span><div><h3 className="text-sm font-medium">Cuenta de Meta</h3><p className="mt-1 text-xs text-muted">{data.connection?.pageName ?? "Sin página conectada"}</p></div></div><StatusPill tone={data.connection ? "good" : "warning"}>{data.connection ? "Conectada" : "Pendiente"}</StatusPill></article>
        </div>
      </div> : null}

      {tab === "configuracion" ? <div className="space-y-6">
        <SectionHeading eyebrow="Comportamiento" title="Personalidad y configuración" description="Definí cómo responde el asistente y cuándo debe pasar la consulta al equipo." action={<button type="button" disabled={pending === "bot-toggle"} onClick={() => void toggleBot(!settings.enabled)} className={settings.enabled ? buttonClass : primaryButtonClass}>{pending === "bot-toggle" ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Sparkles className="size-4" aria-hidden="true" />}{settings.enabled ? "Pausar asistente" : "Activar asistente"}</button>} />
        {!settings.enabled && !readiness.canEnable ? <div className="border border-line bg-sand-soft p-4"><h3 className="text-sm font-medium">Antes de activar</h3><ul className="mt-2 space-y-1 text-sm text-muted">{readiness.reasons.map((reason) => <li className="flex items-start gap-2" key={reason}><CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{reason}</li>)}</ul></div> : null}
        <form onSubmit={saveSettings} className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)]">
          <section className="space-y-5 border border-line bg-paper p-4 sm:p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium">Nombre del asistente<input className={`${inputClass} mt-2`} maxLength={60} value={settings.name} onChange={(event) => setSettings({ ...settings, name: event.target.value })} required /></label>
              <label className="block text-sm font-medium">Tono<select className={`${inputClass} mt-2`} value={settings.tone} onChange={(event) => setSettings({ ...settings, tone: event.target.value as BotSettings["tone"] })}><option value="cercano">Cercano</option><option value="profesional">Profesional</option><option value="entusiasta">Entusiasta</option></select></label>
            </div>
            <label className="block text-sm font-medium">Personalidad<textarea className={`${textAreaClass} mt-2 min-h-32`} maxLength={3000} value={settings.personality} onChange={(event) => setSettings({ ...settings, personality: event.target.value })} required /><span className="mt-1 block text-right text-xs font-normal text-muted">{settings.personality.length}/3000</span></label>
            <label className="block text-sm font-medium">Instrucciones adicionales<textarea className={`${textAreaClass} mt-2 min-h-32`} maxLength={6000} placeholder="Por ejemplo: aclarar disponibilidad antes de confirmar una reserva." value={settings.instructions} onChange={(event) => setSettings({ ...settings, instructions: event.target.value })} /><span className="mt-1 block text-right text-xs font-normal text-muted">{settings.instructions.length}/6000</span></label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium">Uso de emojis<select className={`${inputClass} mt-2`} value={settings.emojiLevel} onChange={(event) => setSettings({ ...settings, emojiLevel: event.target.value as BotSettings["emojiLevel"] })}><option value="ninguno">Sin emojis</option><option value="moderado">Moderado</option><option value="frecuente">Frecuente</option></select></label>
              <label className="block text-sm font-medium">Enlace de ventas (opcional)<input className={`${inputClass} mt-2`} type="url" inputMode="url" placeholder="https://…" value={settings.salesUrl} onChange={(event) => setSettings({ ...settings, salesUrl: event.target.value })} /></label>
            </div>
            <label className="block text-sm font-medium">Mensaje al derivar a una persona<textarea className={`${textAreaClass} mt-2`} maxLength={1000} value={settings.handoffMessage} onChange={(event) => setSettings({ ...settings, handoffMessage: event.target.value })} required /></label>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4"><p className="text-xs text-muted">La activación requiere credenciales, cuenta conectada e información vigente.</p><button className={primaryButtonClass} disabled={pending === "settings"} type="submit">{pending === "settings" ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Check className="size-4" aria-hidden="true" />}Guardar cambios</button></div>
          </section>
          <aside className="space-y-4">
            <section className="border border-line bg-paper p-4 sm:p-5"><div className="flex items-center gap-2"><ShieldCheck className="size-4 text-jade-deep" aria-hidden="true" /><h3 className="text-sm font-medium">Configuración segura</h3></div><p className="mt-3 text-sm leading-6 text-muted">Las claves se verifican en el servidor y no se muestran en este panel. Configurá los nombres de variable en el entorno de despliegue; nunca pegues sus valores acá.</p><ul className="mt-4 space-y-2 font-tabular text-xs text-muted"><li className="rounded-sm bg-surface px-3 py-2">OPENAI_API_KEY</li><li className="rounded-sm bg-surface px-3 py-2">META_APP_ID · META_APP_SECRET</li><li className="rounded-sm bg-surface px-3 py-2">META_WEBHOOK_VERIFY_TOKEN</li><li className="rounded-sm bg-surface px-3 py-2">META_TOKEN_ENCRYPTION_KEY</li><li className="rounded-sm bg-surface px-3 py-2">META_GRAPH_VERSION · SITE_URL</li></ul></section>
            <section className="border border-line bg-paper p-4 sm:p-5"><h3 className="text-sm font-medium">Estado de requisitos</h3><div className="mt-3 space-y-3">{[{ label: "OpenAI", ready: data.readiness.openai }, { label: "Meta", ready: data.readiness.meta }, { label: "Página conectada", ready: Boolean(data.connection) }, { label: "Conocimiento vigente", ready: readiness.canEnable && data.readiness.openai && data.readiness.meta && Boolean(data.connection) }].map((item) => <div key={item.label} className="flex items-center justify-between text-sm"><span>{item.label}</span><StatusPill tone={item.ready ? "good" : "warning"}>{item.ready ? "Listo" : "Pendiente"}</StatusPill></div>)}</div></section>
          </aside>
        </form>
      </div> : null}

      {tab === "conocimiento" ? <div className="space-y-5">
        <SectionHeading eyebrow="Base de respuestas" title="Conocimiento del asistente" description="Organizá la información por tema, local y vigencia para que el asistente responda con contexto correcto." action={<div className="flex flex-wrap gap-2"><label className={`${buttonClass} cursor-pointer`}><Plus className="size-4" aria-hidden="true" />Importar texto<input className="sr-only" type="file" accept=".txt,.md,text/plain,text/markdown" onChange={(event) => { void importText(event.target.files?.[0]); event.currentTarget.value = ""; }} /></label><button className={primaryButtonClass} type="button" onClick={() => { setDraft(initialKnowledge); setEditingKnowledge(true); }}><Plus className="size-4" aria-hidden="true" />Nueva ficha</button></div>} />
        {editingKnowledge ? <form onSubmit={saveKnowledge} className="grid gap-4 border border-line bg-surface/50 p-4 sm:grid-cols-2 sm:p-5">
          <h3 className="text-sm font-medium sm:col-span-2">{draft.id ? "Editar ficha" : "Nueva ficha de conocimiento"}</h3>
          <label className="block text-sm font-medium">Título<input className={`${inputClass} mt-2`} maxLength={160} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} required /></label>
          <label className="block text-sm font-medium">Categoría<select className={`${inputClass} mt-2`} value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value as KnowledgeCategory })}>{categories.map((category) => <option value={category.value} key={category.value}>{category.label}</option>)}</select></label>
          <label className="block text-sm font-medium">Alcance del local<select className={`${inputClass} mt-2`} value={draft.franchiseId ?? ""} onChange={(event) => setDraft({ ...draft, franchiseId: event.target.value || null })}><option value="">Todos los locales</option>{data.franchises.map((franchise) => <option key={franchise.id} value={franchise.id}>{franchise.name}</option>)}</select></label>
          <label className="block text-sm font-medium">Enlace de referencia (opcional)<input className={`${inputClass} mt-2`} type="url" placeholder="https://…" value={draft.url} onChange={(event) => setDraft({ ...draft, url: event.target.value })} /></label>
          <label className="block text-sm font-medium sm:col-span-2">Contenido<textarea className={`${textAreaClass} mt-2 min-h-36`} maxLength={4000} value={draft.content} onChange={(event) => setDraft({ ...draft, content: event.target.value })} required /><span className="mt-1 block text-right text-xs font-normal text-muted">{draft.content.length}/4000 caracteres</span></label>
          <div className="grid gap-4 sm:grid-cols-2 sm:col-span-2"><label className="block text-sm font-medium">Válida desde<input className={`${inputClass} mt-2`} type="date" value={draft.validFrom ?? ""} onChange={(event) => setDraft({ ...draft, validFrom: event.target.value || null })} /></label><label className="block text-sm font-medium">Válida hasta<input className={`${inputClass} mt-2`} type="date" value={draft.validUntil ?? ""} onChange={(event) => setDraft({ ...draft, validUntil: event.target.value || null })} /></label></div>
          <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={draft.enabled} onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })} className="size-4 accent-[#1f6e56]" />Ficha habilitada para el asistente</label>
          <div className="flex flex-wrap justify-end gap-2 sm:col-span-2"><button type="button" className={buttonClass} onClick={() => { setEditingKnowledge(false); setDraft(initialKnowledge); }}>Cancelar</button><button className={primaryButtonClass} disabled={pending === "knowledge"} type="submit">{pending === "knowledge" ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Check className="size-4" aria-hidden="true" />}Guardar ficha</button></div>
        </form> : null}
        {data.knowledge.length ? <div className="divide-y divide-line border border-line bg-paper">{data.knowledge.map((entry) => {
          const categoryLabel = categories.find((category) => category.value === entry.category)?.label ?? entry.category;
          const franchiseLabel = data.franchises.find((franchise) => franchise.id === entry.franchiseId)?.name ?? "Todos los locales";
          return <article key={entry.id} className="p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-medium">{entry.title}</h3><StatusPill tone={entry.enabled ? "good" : "neutral"}>{entry.enabled ? "Habilitada" : "Pausada"}</StatusPill></div><p className="mt-1 text-xs text-muted">{categoryLabel} · {franchiseLabel}</p></div><div className="flex shrink-0 gap-2"><button className={buttonClass} type="button" onClick={() => { setDraft({ ...entry }); setEditingKnowledge(true); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Editar</button><button className={buttonClass} type="button" aria-label={`Eliminar ${entry.title}`} disabled={pending === `delete-${entry.id}`} onClick={() => void deleteKnowledge(entry.id)}><Trash2 className="size-4" aria-hidden="true" /></button></div></div>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted">{entry.content}</p>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted">{entry.validFrom || entry.validUntil ? <span className="inline-flex items-center gap-1"><Clock3 className="size-3.5" aria-hidden="true" />Vigencia: {entry.validFrom ? dateLabel(entry.validFrom) : "Sin inicio"} – {entry.validUntil ? dateLabel(entry.validUntil) : "Sin vencimiento"}</span> : <span>Sin fecha de vencimiento</span>}{entry.url ? <a className="inline-flex items-center gap-1 text-jade-deep hover:underline" href={entry.url} target="_blank" rel="noreferrer">Ver referencia<ExternalLink className="size-3" aria-hidden="true" /></a> : null}</div>
          </article>;
        })}</div> : <EmptyState icon={FileText} title="La base de conocimiento está vacía" description="Agregá respuestas, horarios o información de productos para dar contexto al asistente." action={<button type="button" className={primaryButtonClass} onClick={() => setEditingKnowledge(true)}><Plus className="size-4" aria-hidden="true" />Agregar primera ficha</button>} />}
        <p className="text-xs text-muted">Podés importar un archivo de texto de hasta 20 KB; revisá su contenido y guardalo como ficha para mantenerlo organizado.</p>
      </div> : null}

      {tab === "bandeja" ? <div className="space-y-5">
        <SectionHeading eyebrow="Atención al cliente" title="Bandeja de conversaciones" description="Revisá los últimos 100 chats recibidos y tomá el control cuando sea necesario." />
        <div className="grid min-h-120 gap-0 border border-line bg-paper lg:grid-cols-[minmax(250px,0.75fr)_minmax(0,1.4fr)]">
          <aside className="border-b border-line lg:border-b-0 lg:border-r">
            <div className="flex items-center justify-between border-b border-line px-4 py-3"><h3 className="text-sm font-medium">Recientes</h3><span className="text-xs text-muted">{data.conversations.length}</span></div>
            {data.conversations.length ? <ul className="max-h-140 divide-y divide-line overflow-y-auto">{data.conversations.map((conversation) => <li key={conversation.id}><button type="button" aria-current={selectedConversation === conversation.id ? "true" : undefined} onClick={() => void loadConversation(conversation.id)} className={`w-full px-4 py-4 text-left transition-colors ${selectedConversation === conversation.id ? "bg-surface" : "hover:bg-surface/60"}`}><span className="flex items-center justify-between gap-3"><span className="truncate text-sm font-medium">{conversation.participant_id}</span><StatusPill tone={conversation.status === "human" ? "warning" : "neutral"}>{conversation.status === "human" ? "Equipo" : "Bot"}</StatusPill></span><span className="mt-2 flex items-center justify-between text-xs text-muted"><span className="inline-flex items-center gap-1"><Camera className="size-3.5" aria-hidden="true" />{conversation.channel === "instagram" ? "Instagram" : "Messenger"}</span><time>{dateLabel(conversation.updated_at, true)}</time></span></button></li>)}</ul> : <div className="p-4"><p className="text-sm font-medium">Sin conversaciones recientes</p><p className="mt-2 text-sm leading-6 text-muted">Cuando llegue un mensaje a la página conectada, aparecerá acá.</p></div>}
          </aside>
          <section className="flex min-h-105 min-w-0 flex-col">
            {currentConversation ? <>
              <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3"><div className="min-w-0"><h3 className="truncate text-sm font-medium">{currentConversation.participant_id}</h3><p className="mt-1 text-xs text-muted">{currentConversation.channel === "instagram" ? "Instagram" : "Messenger"} · Conversación {conversationStatus === "human" ? "a cargo del equipo" : "atendida por el bot"}</p></div><button type="button" className={conversationStatus === "human" ? buttonClass : primaryButtonClass} disabled={pending === "takeover"} onClick={() => void updateConversationStatus(conversationStatus === "human" ? "bot" : "human")}>{pending === "takeover" ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : conversationStatus === "human" ? <Bot className="size-4" aria-hidden="true" /> : <UserRound className="size-4" aria-hidden="true" />}{conversationStatus === "human" ? "Devolver al bot" : "Tomar conversación"}</button></header>
              <div className="flex-1 space-y-3 overflow-y-auto bg-surface/40 p-4" aria-live="polite">{pending === "conversation-load" ? <p className="flex items-center gap-2 text-sm text-muted"><LoaderCircle className="size-4 animate-spin" aria-hidden="true" />Cargando mensajes…</p> : conversationMessages.length ? conversationMessages.map((message) => <div key={message.id} className={`flex ${message.role === "user" ? "justify-start" : "justify-end"}`}><article className={`max-w-[88%] rounded-sm border px-3 py-2.5 ${message.role === "user" ? "border-line bg-paper" : message.role === "human" ? "border-[#b8dfd0] bg-[#E0F1EB]" : "border-line bg-sand-soft"}`}><p className="mb-1 text-[11px] font-medium text-muted">{message.role === "user" ? "Cliente" : message.role === "human" ? "Equipo Bears" : "Asistente"} · {dateLabel(message.created_at, true)}</p><p className="whitespace-pre-wrap text-sm leading-6">{message.content}</p><p className={`mt-1 text-right text-[11px] ${message.status === "failed" ? "text-alert" : "text-muted"}`}>{message.status === "sent" ? "Enviado" : message.status === "pending" ? "Pendiente" : message.status === "failed" ? "Error de envío" : "Recibido"}</p></article></div>) : <p className="text-sm text-muted">No hay mensajes en esta conversación todavía.</p>}</div>
              {conversationStatus === "human" ? <form onSubmit={sendHumanReply} className="flex items-end gap-2 border-t border-line p-3"><label className="sr-only" htmlFor="human-reply">Respuesta para el cliente</label><textarea id="human-reply" className={`${textAreaClass} min-h-11 flex-1 resize-y`} maxLength={1800} placeholder="Escribí una respuesta…" value={humanReply} onChange={(event) => setHumanReply(event.target.value)} required /><button className={primaryButtonClass} disabled={pending === "human-reply" || !humanReply.trim()} type="submit">{pending === "human-reply" ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Send className="size-4" aria-hidden="true" />}<span className="hidden sm:inline">Enviar</span></button></form> : <p className="border-t border-line px-4 py-3 text-xs leading-5 text-muted">Tomá el control para enviar una respuesta humana. Meta permite responder dentro de las 24 horas desde el último mensaje del cliente.</p>}
            </> : <div className="grid flex-1 place-items-center p-6 text-center"><div><span className="mx-auto grid size-11 place-items-center rounded-full bg-surface text-muted"><MessageSquareText className="size-5" aria-hidden="true" /></span><p className="mt-4 text-sm font-medium">Seleccioná una conversación</p><p className="mt-2 text-sm text-muted">El historial de mensajes aparecerá en este espacio.</p></div></div>}
          </section>
        </div>
      </div> : null}

      {tab === "conexiones" ? <div className="space-y-6">
        <SectionHeading eyebrow="Canales y permisos" title="Conexiones" description="Conectá la página de Facebook de Bears para habilitar Instagram y Messenger." />
        {metaNotice ? <div role="status" className="flex items-start gap-2 border border-[#b8dfd0] bg-[#E0F1EB] px-4 py-3 text-sm text-jade-deep"><Check className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{metaNotice}</div> : null}
        {!data.readiness.meta ? <div className="border border-line bg-sand-soft p-4"><h3 className="text-sm font-medium">Falta configuración de Meta</h3><p className="mt-2 text-sm leading-6 text-muted">Configurá las variables server-side antes de iniciar OAuth: META_APP_ID, META_APP_SECRET, META_WEBHOOK_VERIFY_TOKEN, META_TOKEN_ENCRYPTION_KEY, META_GRAPH_VERSION y SITE_URL. Los valores permanecen ocultos.</p></div> : null}
        {metaPages.length ? <form onSubmit={finalizeMetaConnection} className="space-y-4 border border-line bg-paper p-4 sm:p-6"><div><h3 className="text-sm font-medium">Seleccioná la página de Bears</h3><p className="mt-1 text-sm text-muted">Solo se conectará una página. Confirmá que Instagram Business esté vinculado a la página elegida.</p></div><div className="grid gap-3 sm:grid-cols-2">{metaPages.map((page) => <label key={page.id} className={`cursor-pointer border p-4 transition-colors ${selectedPageId === page.id ? "border-jade bg-[#E0F1EB]" : "border-line hover:bg-surface"}`}><span className="flex items-start gap-3"><input type="radio" name="meta-page" value={page.id} checked={selectedPageId === page.id} onChange={() => setSelectedPageId(page.id)} className="mt-1 accent-[#1f6e56]" /><span><span className="block text-sm font-medium">{page.name}</span><span className="mt-1 block text-xs text-muted">{page.instagramId ? `Instagram Business · ${page.instagramId}` : "Instagram Business no detectado"}</span></span></span></label>)}</div><button type="submit" className={primaryButtonClass} disabled={!selectedPageId || pending === "connect-page"}>{pending === "connect-page" ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Check className="size-4" aria-hidden="true" />}Confirmar página</button></form> : null}
        <section className="border border-line bg-paper">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line p-4 sm:p-5"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-sm bg-surface text-muted"><Camera className="size-5" aria-hidden="true" /></span><div><h3 className="text-sm font-medium">Meta · Facebook e Instagram</h3><p className="mt-1 text-xs text-muted">Una página de Bears y su cuenta de Instagram Business vinculada</p></div></div><StatusPill tone={data.connection ? "good" : "warning"}>{data.connection ? "Conectada" : "Sin conectar"}</StatusPill></div>
          {data.connection ? <div className="p-4 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><h4 className="text-base font-medium">{data.connection.pageName}</h4><p className="mt-1 text-sm text-muted">Facebook Page ID · {data.connection.pageId}</p><p className="mt-1 text-sm text-muted">Instagram Business ID · {data.connection.instagramId ?? "No disponible"}</p><p className="mt-2 text-xs text-muted">Conectada {dateLabel(data.connection.connectedAt, true)}</p></div><div className="flex flex-wrap gap-2"><button type="button" className={buttonClass} onClick={() => void syncSocial()} disabled={pending === "sync"}>{pending === "sync" ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="size-4" aria-hidden="true" />}Sincronizar publicaciones</button><button type="button" className={`${buttonClass} text-alert`} disabled={pending === "disconnect"} onClick={() => void disconnectMeta()}>{pending === "disconnect" ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <X className="size-4" aria-hidden="true" />}Desconectar</button></div></div><p className="mt-3 text-xs leading-5 text-muted">Cada sincronización consulta las 50 publicaciones más recientes de Instagram y las 50 más recientes de Facebook. La actividad social muestra hasta 100 elementos.</p></div> : <div className="p-4 sm:p-5"><p className="max-w-3xl text-sm leading-6 text-muted">Conectá únicamente la página oficial de Bears. La autorización se realiza en Meta y las credenciales quedan cifradas en el servidor; no se muestran ni se guardan en el navegador.</p><form action="/api/meta/connect" method="post" className="mt-4"><button type="submit" className={primaryButtonClass} disabled={!data.readiness.meta}><Camera className="size-4" aria-hidden="true" />Conectar con Meta</button></form></div>}
        </section>
        <section className="border border-line bg-surface/60 p-4 sm:p-5"><h3 className="text-sm font-medium">Preparación de Meta</h3><p className="mt-2 text-sm leading-6 text-muted">En el panel de tu app de Meta, habilitá el producto Messenger API for Instagram y los campos de webhook de Instagram que vas a usar, como mensajes y comentarios, además de aprobar los permisos que necesita la app. La cuenta debe ser profesional, estar vinculada a la página oficial de Bears y permitir mensajes de herramientas conectadas. En Instagram, revisá <span className="font-medium text-ink">Configuración y actividad → Mensajes y respuestas a historias → Controles de mensajes → Herramientas conectadas</span> y habilitá el acceso a los mensajes. Los nombres pueden variar según la versión de la app.</p><div className="mt-4 flex flex-wrap gap-4 text-sm"><a className="inline-flex items-center gap-1 font-medium text-jade-deep hover:underline" href="https://developers.facebook.com/docs/messenger-platform/instagram/" target="_blank" rel="noreferrer">Guía oficial de Meta para Instagram Messaging<ExternalLink className="size-3.5" aria-hidden="true" /></a><a className="inline-flex items-center gap-1 font-medium text-jade-deep hover:underline" href="https://developers.facebook.com/apps/" target="_blank" rel="noreferrer">Abrir el panel de apps de Meta<ExternalLink className="size-3.5" aria-hidden="true" /></a></div></section>
      </div> : null}

      {tab === "social" ? <div className="space-y-5">
        <SectionHeading eyebrow="Publicaciones y menciones" title="Actividad social" description="Hasta 100 actividades recientes sincronizadas de Instagram y Facebook." action={data.connection ? <button className={primaryButtonClass} type="button" onClick={() => void syncSocial()} disabled={pending === "sync"}>{pending === "sync" ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="size-4" aria-hidden="true" />}Sincronizar publicaciones</button> : undefined} />
        {!data.connection ? <div className="border border-line bg-sand-soft p-4 text-sm leading-6 text-muted">Conectá la página oficial de Bears en la sección Conexiones para sincronizar publicaciones recientes. La sincronización no publica ni modifica contenido.</div> : null}
        <div className="border-l-2 border-sand bg-sand-soft px-4 py-3 text-sm leading-6 text-ink">El asistente puede consultar como contexto público las 20 publicaciones sincronizadas más recientes de los últimos 90 días. Son contenido fechado, no una confirmación de promociones, precios o condiciones vigentes. Las menciones de terceros no se usan como conocimiento comercial de Bears.</div>
        {data.assets.length ? <div className="divide-y divide-line border border-line bg-paper px-4 sm:px-5">{data.assets.slice(0, 100).map((asset) => <SocialAssetRow key={asset.id} asset={asset} />)}</div> : <EmptyState icon={Activity} title="Todavía no hay actividad social" description={data.connection ? "Sincronizá las 50 publicaciones más recientes de Instagram para ver aquí el contenido disponible." : "Cuando conectes Meta y haya actividad sincronizada, las publicaciones y menciones aparecerán aquí."} action={data.connection ? <button className={primaryButtonClass} type="button" onClick={() => void syncSocial()} disabled={pending === "sync"}><RefreshCw className="size-4" aria-hidden="true" />Sincronizar ahora</button> : undefined} />}
      </div> : null}

      {tab === "prueba" ? <div className="space-y-5">
        <SectionHeading eyebrow="Simulación privada" title="Zona de prueba" description="Probá el tono del asistente antes de publicar cambios. Los mensajes de esta vista no se envían a clientes." />
        {!data.readiness.openai ? <div className="border border-line bg-sand-soft px-4 py-3 text-sm text-muted">La zona de prueba requiere configurar OPENAI_API_KEY en el entorno seguro.</div> : null}
        <div className="flex min-h-130 flex-col border border-line bg-paper">
          <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3"><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-sm bg-jade-deep text-white"><Bot className="size-5" aria-hidden="true" /></span><div><h3 className="text-sm font-medium">{settings.name || "Asistente Bears"}</h3><p className="mt-1 text-xs text-muted">Vista de prueba · No visible para clientes</p></div></div><button type="button" className={buttonClass} disabled={pending === "playground"} onClick={() => setPlaygroundMessages([])}><RefreshCw className="size-4" aria-hidden="true" />Nueva prueba</button></header>
          <div className="flex-1 space-y-4 overflow-y-auto bg-surface/40 p-4 sm:p-6" aria-live="polite">
            {!playgroundMessages.length ? <div className="grid min-h-64 place-items-center text-center"><div className="max-w-sm"><Sparkles className="mx-auto size-7 text-jade-deep" aria-hidden="true" /><p className="mt-3 text-sm font-medium">¿Qué querés probar?</p><p className="mt-2 text-sm leading-6 text-muted">Escribí una consulta como lo haría un cliente. La prueba usa la configuración y las fichas actuales.</p></div></div> : null}
            {playgroundMessages.map((message, index) => <div key={`${index}-${message.role}`} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}><article className={`max-w-[88%] rounded-sm border px-4 py-3 sm:max-w-[75%] ${message.role === "user" ? "border-jade-deep bg-jade-deep text-white" : "border-line bg-paper"}`}><p className="mb-1 text-[11px] font-medium opacity-70">{message.role === "user" ? "Vos" : settings.name || "Asistente Bears"}</p><p className="whitespace-pre-wrap text-sm leading-6">{message.content}</p>{message.handoff ? <p className="mt-3 flex items-center gap-2 border-t border-line pt-2 text-xs text-alert"><UserRound className="size-3.5" aria-hidden="true" />Esta respuesta deriva la consulta a una persona.</p> : null}</article></div>)}
            {pending === "playground" ? <div className="flex"><p className="flex items-center gap-2 rounded-sm border border-line bg-paper px-4 py-3 text-sm text-muted"><LoaderCircle className="size-4 animate-spin" aria-hidden="true" />Preparando respuesta…</p></div> : null}
          </div>
          <form onSubmit={runPlayground} className="flex items-end gap-2 border-t border-line p-3 sm:p-4"><label className="sr-only" htmlFor="playground-message">Mensaje de prueba</label><textarea id="playground-message" className={`${textAreaClass} min-h-11 flex-1 resize-y`} maxLength={4000} placeholder="Escribí un mensaje de prueba…" value={playgroundInput} onChange={(event) => setPlaygroundInput(event.target.value)} required /><button className={primaryButtonClass} disabled={pending === "playground" || !playgroundInput.trim() || !data.readiness.openai} type="submit"><Send className="size-4" aria-hidden="true" /><span className="hidden sm:inline">Enviar prueba</span></button></form>
          <p className="border-t border-line px-4 py-2 text-xs text-muted">Hasta 4.000 caracteres por consulta. Las pruebas tienen un límite de uso por hora.</p>
        </div>
      </div> : null}
    </section> : null}

    {data && tab === "resumen" && data.assets.length ? <section className="border border-line bg-paper p-4 sm:p-5">
      <SectionHeading title="Actividad social reciente" description="Publicaciones sincronizadas de los canales conectados." />
      <div className="mt-4 divide-y divide-line">{data.assets.slice(0, 4).map((asset) => <SocialAssetRow key={asset.id} asset={asset} />)}</div>
    </section> : null}
  </div>;
}

function SocialAssetRow({ asset }: { asset: SocialAsset }) {
  return <article className="flex flex-wrap items-start justify-between gap-3 py-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><StatusPill>{asset.kind === "mencion" ? "Mención" : asset.kind === "publicacion_fb" ? "Facebook" : "Publicación"}</StatusPill><time className="text-xs text-muted">{dateLabel(asset.occurred_at, true)}</time></div><p className="mt-2 line-clamp-2 text-sm leading-6">{asset.text || "Sin texto disponible"}</p></div>{asset.url ? <a href={asset.url} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-jade-deep hover:underline">Abrir<ExternalLink className="size-3.5" aria-hidden="true" /></a> : null}</article>;
}
