import { AdminManualsManager, type ManualCategory, type ManualRecord } from "@/components/manuals/manual-library";
import { PortalShell } from "@/components/portal/portal-shell";
import { PortalLayout } from "@/components/portal/portal-layout";
import { requireRole } from "@/lib/auth/roles";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export default async function AdminManualsPage() {
  if (!isSupabaseConfigured()) return <PortalShell role="admin" view="manuals" />;
  const viewer = await requireRole(["admin"]);
  const supabase = await createClient();
  const [{ data: manualData }, { data: categoryData }, { data: downloadData }] = await Promise.all([
    supabase.from("manuals").select("id, title, description, category_id, file_url, storage_path, file_type, size_bytes, version, visible_to, created_at, manual_categories(name)").order("created_at", { ascending: false }),
    supabase.from("manual_categories").select("id, name, order_index").order("order_index"),
    supabase.from("manual_downloads").select("manual_id"),
  ]);
  const downloadsByManual = new Map<string, number>();
  for (const download of downloadData ?? []) downloadsByManual.set(download.manual_id, (downloadsByManual.get(download.manual_id) ?? 0) + 1);
  const manuals: ManualRecord[] = (manualData ?? []).map((manual) => ({ id: manual.id, title: manual.title, description: manual.description, categoryId: manual.category_id, categoryName: manual.manual_categories[0]?.name ?? null, fileUrl: manual.file_url, storagePath: manual.storage_path, fileType: manual.file_type, sizeBytes: manual.size_bytes, version: manual.version, visibleTo: manual.visible_to, createdAt: manual.created_at, downloadCount: downloadsByManual.get(manual.id) ?? 0 }));
  const categories: ManualCategory[] = (categoryData ?? []).map((category) => ({ id: category.id, name: category.name, orderIndex: category.order_index }));
  return <PortalLayout viewer={viewer} activeKey="manuals"><AdminManualsManager manuals={manuals} categories={categories} /></PortalLayout>;
}