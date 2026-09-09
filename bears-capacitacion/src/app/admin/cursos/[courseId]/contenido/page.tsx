import { notFound } from "next/navigation";
import {
  CourseContentStudio,
  type CourseContentAsset,
  type CourseContentModule,
} from "@/components/admin/course-content-studio";
import { PortalLayout } from "@/components/portal/portal-layout";
import { PortalShell } from "@/components/portal/portal-shell";
import { requireRole } from "@/lib/auth/roles";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

type CourseContentPageProps = {
  params: Promise<{ courseId: string }>;
};

export default async function CourseContentPage({
  params,
}: CourseContentPageProps) {
  if (!isSupabaseConfigured())
    return <PortalShell role="admin" view="courses" />;

  const viewer = await requireRole(["admin"]);
  const { courseId } = await params;
  const supabase = await createClient();
  const { data: courseData } = await supabase
    .from("courses")
    .select("id, title, slug")
    .eq("id", courseId)
    .maybeSingle();
  if (!courseData) notFound();

  const { data: moduleData } = await supabase
    .from("modules")
    .select("id, title, order_index")
    .eq("course_id", courseData.id)
    .order("order_index");
  const sourceModules = moduleData ?? [];
  const moduleIds = sourceModules.map((module) => module.id);
  const [{ data: courseAssetData }, { data: moduleAssetData }] =
    await Promise.all([
      supabase
        .from("assets")
        .select(
          "id, course_id, module_id, type, is_primary, title, description, url, storage_path, video_poster_storage_path, duration_seconds, size_bytes, order_index",
        )
        .eq("course_id", courseData.id)
        .order("order_index"),
      moduleIds.length
        ? supabase
            .from("assets")
            .select(
              "id, course_id, module_id, type, is_primary, title, description, url, storage_path, video_poster_storage_path, duration_seconds, size_bytes, order_index",
            )
            .in("module_id", moduleIds)
            .order("order_index")
        : Promise.resolve({ data: [] }),
    ]);

  const toAsset = (asset: {
    id: string;
    course_id: string | null;
    module_id: string | null;
    type: CourseContentAsset["type"];
    is_primary: boolean;
    title: string;
    description: string | null;
    url: string;
    storage_path: string | null;
    video_poster_storage_path: string | null;
    duration_seconds: number;
    size_bytes: number | null;
    order_index: number;
  }): CourseContentAsset => ({
    id: asset.id,
    courseId: asset.course_id,
    moduleId: asset.module_id,
    type: asset.type,
    isPrimary: asset.is_primary,
    title: asset.title,
    description: asset.description,
    url: asset.url,
    storagePath: asset.storage_path,
    videoPosterStoragePath: asset.video_poster_storage_path,
    durationSeconds: asset.duration_seconds,
    sizeBytes: asset.size_bytes,
    orderIndex: asset.order_index,
  });
  const courseAssets = (courseAssetData ?? []).map(toAsset);
  const moduleAssets = (moduleAssetData ?? []).map(toAsset);
  const modules: CourseContentModule[] = sourceModules.map((module) => ({
    id: module.id,
    title: module.title,
    orderIndex: module.order_index,
    assets: moduleAssets.filter((asset) => asset.moduleId === module.id),
  }));

  return (
    <PortalLayout viewer={viewer} activeKey="courses">
      <CourseContentStudio
        course={courseData}
        courseAssets={courseAssets}
        modules={modules}
      />
    </PortalLayout>
  );
}
