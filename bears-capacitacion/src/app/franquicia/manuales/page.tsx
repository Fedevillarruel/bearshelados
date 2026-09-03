import { ManualLibrary, type ManualRecord } from "@/components/manuals/manual-library";
import { PortalShell } from "@/components/portal/portal-shell";
import { PortalLayout } from "@/components/portal/portal-layout";
import { requireRole } from "@/lib/auth/roles";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export default async function FranchiseManualsPage() {
  if (!isSupabaseConfigured()) return <PortalShell role="franquiciado" view="manuals" />;
  const viewer = await requireRole(["franquiciado"]);
  const supabase = await createClient();
  const { data } = await supabase.from("manuals").select("id, title, description, category_id, file_url, storage_path, file_type, size_bytes, version, visible_to, created_at, manual_categories(name)").order("created_at", { ascending: false });
  const manuals: ManualRecord[] = (data ?? []).map((manual) => ({ id: manual.id, title: manual.title, description: manual.description, categoryId: manual.category_id, categoryName: manual.manual_categories[0]?.name ?? null, fileUrl: manual.file_url, storagePath: manual.storage_path, fileType: manual.file_type, sizeBytes: manual.size_bytes, version: manual.version, visibleTo: manual.visible_to, createdAt: manual.created_at }));
  return <PortalLayout viewer={viewer} activeKey="manuals"><ManualLibrary manuals={manuals} heading="Manuales e instructivos" description="Documentación vigente para tu franquicia." /></PortalLayout>;
}