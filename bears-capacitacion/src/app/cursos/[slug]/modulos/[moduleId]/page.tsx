import { notFound } from "next/navigation";
import { EmployeeCoursePlayer } from "@/components/learning/employee-course-player";
import { CoursePlayer } from "@/components/portal/portal-shell";
import { requireRole } from "@/lib/auth/roles";
import { getEmployeeCourseModule } from "@/lib/platform/employee";
import { isSupabaseConfigured } from "@/lib/supabase/config";

type CourseModulePageProps = {
	params: Promise<{ slug: string; moduleId: string }>;
};

export default async function CourseModulePage({ params }: CourseModulePageProps) {
	if (!isSupabaseConfigured()) return <CoursePlayer />;

	const viewer = await requireRole(["empleado"]);
	const { slug, moduleId } = await params;
	const data = await getEmployeeCourseModule(viewer, slug, moduleId);
	if (!data) notFound();

	return <EmployeeCoursePlayer data={data} />;
}