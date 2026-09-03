import { notFound } from "next/navigation";
import { AdaptiveCoursePlayer } from "@/components/learning/adaptive-course-player";
import { CoursePlayer } from "@/components/portal/portal-shell";
import { requireRole } from "@/lib/auth/roles";
import { getEmployeeCourseModule } from "@/lib/platform/employee";
import { isSupabaseConfigured } from "@/lib/supabase/config";

type CourseModulePageProps = {
	params: Promise<{ slug: string; moduleId: string }>;
};

export default async function CourseModulePage({ params }: CourseModulePageProps) {
	if (!isSupabaseConfigured()) return <CoursePlayer />;

	const viewer = await requireRole(["empleado", "franquiciado"]);
	const { slug, moduleId } = await params;
	const data = await getEmployeeCourseModule(viewer, slug, moduleId);
	if (!data) notFound();

	return <AdaptiveCoursePlayer data={data} />;
}