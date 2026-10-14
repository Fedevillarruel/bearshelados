import type { SupabaseClient } from "@supabase/supabase-js";

type Module = { id: string };
type Exam = { id: string; module_id: string | null; blocks_progress: boolean };
type Asset = { id: string; module_id: string; type: string };
type CompletionEvidence = {
  modules: Module[];
  exams: Exam[];
  assets: Asset[];
  passedExamIds: string[];
  completedVideoIds: string[];
  viewedResourceIds: string[];
};

export function calculateCourseCompletion(evidence: CompletionEvidence) {
  const passed = new Set(evidence.passedExamIds);
  const videos = new Set(evidence.completedVideoIds);
  const resources = new Set(evidence.viewedResourceIds);
  const completedModuleIds = evidence.modules.filter((module) => {
    const exams = evidence.exams.filter((exam) => exam.module_id === module.id);
    if (exams.length) return exams.every((exam) => passed.has(exam.id));
    return evidence.assets.filter((asset) => asset.module_id === module.id)
      .every((asset) => asset.type === "video" ? videos.has(asset.id) : resources.has(asset.id));
  }).map((module) => module.id);
  const finalPassed = evidence.exams
    .filter((exam) => exam.module_id === null && exam.blocks_progress)
    .every((exam) => passed.has(exam.id));
  const allModulesCompleted = evidence.modules.length > 0 && completedModuleIds.length === evidence.modules.length;
  return {
    completedModuleIds,
    completedExamIds: evidence.passedExamIds,
    isCompleted: allModulesCompleted && finalPassed,
    progressPercent: allModulesCompleted && !finalPassed
      ? 99
      : evidence.modules.length ? Math.round(completedModuleIds.length / evidence.modules.length * 10000) / 100 : 0,
  };
}

async function readPages<T>(query: {
  range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>;
}, message: string): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await query.range(offset, offset + 999);
    if (error || !data) throw new Error(message);
    rows.push(...data);
    if (data.length < 1000) return rows;
  }
}

// Read primary evidence instead of trusting a possibly stale module_progress cache.
export async function getCourseCompletion(
  supabase: SupabaseClient,
  userId: string,
  courseId: string,
  modules: Module[],
) {
  const moduleIds = modules.map((module) => module.id);
  const [moduleExams, finalExams, assets] = await Promise.all([
    moduleIds.length
      ? readPages<Exam>(supabase.from("exams").select("id, module_id, blocks_progress")
          .in("module_id", moduleIds).eq("is_active", true).order("id"),
        "No pudimos verificar las evaluaciones de los módulos.")
      : [],
    readPages<Exam>(supabase.from("exams").select("id, module_id, blocks_progress")
      .eq("course_id", courseId).is("module_id", null).eq("is_active", true).order("id"),
    "No pudimos verificar las evaluaciones finales."),
    moduleIds.length
      ? readPages<Asset>(supabase.from("assets").select("id, module_id, type")
          .in("module_id", moduleIds).order("id"),
        "No pudimos verificar los contenidos de los módulos.")
      : [],
  ]);
  const exams = [...moduleExams, ...finalExams];
  const videoIds = assets.filter((asset) => asset.type === "video").map((asset) => asset.id);
  const resourceIds = assets.filter((asset) => asset.type !== "video").map((asset) => asset.id);
  const [attempts, videoProgress, resourceProgress] = await Promise.all([
    exams.length
      ? readPages<{ exam_id: string }>(supabase.from("exam_attempts").select("exam_id")
          .eq("user_id", userId).eq("passed", true).in("exam_id", exams.map((exam) => exam.id)).order("id"),
        "No pudimos verificar las evaluaciones aprobadas.")
      : [],
    videoIds.length
      ? readPages<{ asset_id: string }>(supabase.from("video_progress").select("asset_id")
          .eq("user_id", userId).eq("completed", true).in("asset_id", videoIds).order("asset_id"),
        "No pudimos verificar los videos completados.")
      : [],
    resourceIds.length
      ? readPages<{ asset_id: string }>(supabase.from("resource_progress").select("asset_id")
          .eq("user_id", userId).in("asset_id", resourceIds).order("asset_id"),
        "No pudimos verificar los recursos consultados.")
      : [],
  ]);
  return calculateCourseCompletion({
    modules, exams, assets,
    passedExamIds: [...new Set(attempts.map((attempt) => attempt.exam_id))],
    completedVideoIds: videoProgress.map((progress) => progress.asset_id),
    viewedResourceIds: resourceProgress.map((progress) => progress.asset_id),
  });
}
