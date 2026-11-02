import { requirePortalRole } from "@/lib/auth/roles";
import { PortalLayout } from "@/components/portal/portal-layout";
import { AIWorkspace } from "@/components/admin/ai-workspace";
import { notFound } from "next/navigation";
import { aiSectionKey, getAISection } from "@/lib/ai/sections";

export const dynamic = "force-dynamic";
export default async function AIPage({ searchParams }: { searchParams: Promise<{ section?: string; meta?: string }> }) {
  const viewer = await requirePortalRole(["admin"]);
  const params = await searchParams;
  const section = params.section ? getAISection(params.section) : params.meta ? "conexiones" : "resumen";
  if (!section) notFound();
  return <PortalLayout viewer={viewer} activeKey={aiSectionKey(section)}><AIWorkspace tab={section} /></PortalLayout>;
}
