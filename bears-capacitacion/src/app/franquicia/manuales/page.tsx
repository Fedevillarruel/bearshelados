import { ManualLibrary, type ManualRecord } from "@/components/manuals/manual-library";
import { PortalShell } from "@/components/portal/portal-shell";
import { PortalLayout } from "@/components/portal/portal-layout";
import { requirePortalRole } from "@/lib/auth/roles";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { manualCategoryName } from "@/lib/manual-category";

export default async function FranchiseManualsPage() {
  if (!isSupabaseConfigured()) return <PortalShell role="franquiciado" view="manuals" />;
  const viewer = await requirePortalRole(["franquiciado"]);
  const supabase = await createClient();
  const { data, error } = await supabase.from("manuals").select("id, title, description, category_id, file_url, storage_path, file_type, size_bytes, version, visible_to, created_at, manual_categories(name)").contains("visible_to", [viewer.role]).order("created_at", { ascending: false });
  if (error) throw new Error("No pudimos cargar los manuales de esta vista.");
  const manuals: ManualRecord[] = (data ?? []).map((manual) => ({ id: manual.id, title: manual.title, description: manual.description, categoryId: manual.category_id, categoryName: manualCategoryName(manual.manual_categories), fileUrl: manual.file_url, storagePath: manual.storage_path, fileType: manual.file_type, sizeBytes: manual.size_bytes, version: manual.version, visibleTo: manual.visible_to, createdAt: manual.created_at }));
  return <PortalLayout viewer={viewer} activeKey="manuals"><ManualLibrary manuals={manuals} heading="Manuales e instructivos" description="Documentación vigente para tu franquicia." /></PortalLayout>;
}