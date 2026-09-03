import { CoursesManager, type ManagedCourse } from "@/components/admin/courses-manager";
import { PortalShell } from "@/components/portal/portal-shell";
import { PortalLayout } from "@/components/portal/portal-layout";
import { requireRole } from "@/lib/auth/roles";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export default async function AdminCoursesPage() {
	if (!isSupabaseConfigured()) return <PortalShell role="admin" view="courses" />;

	const viewer = await requireRole(["admin"]);
	const supabase = await createClient();
	const [{ data: courseData }, { data: moduleData }, { data: enrollmentData }] = await Promise.all([
		supabase.from("courses").select("id, title, slug, description, summary, cover_url, category, estimated_minutes, is_published, order_index").order("order_index"),
		supabase.from("modules").select("id, course_id"),
		supabase.from("enrollments").select("course_id, progress_percent"),
	]);
	const modulesByCourse = new Map<string, number>();
	for (const courseModule of moduleData ?? []) modulesByCourse.set(courseModule.course_id, (modulesByCourse.get(courseModule.course_id) ?? 0) + 1);
	const enrollmentsByCourse = new Map<string, number[]>();
	for (const enrollment of enrollmentData ?? []) enrollmentsByCourse.set(enrollment.course_id, [...(enrollmentsByCourse.get(enrollment.course_id) ?? []), Number(enrollment.progress_percent)]);
	const courses: ManagedCourse[] = (courseData ?? []).map((course) => {
		const progress = enrollmentsByCourse.get(course.id) ?? [];
		return { id: course.id, title: course.title, slug: course.slug, description: course.description, summary: course.summary, coverUrl: course.cover_url, category: course.category, estimatedMinutes: course.estimated_minutes ?? 0, isPublished: course.is_published, orderIndex: course.order_index, moduleCount: modulesByCourse.get(course.id) ?? 0, enrollmentCount: progress.length, completionPercent: progress.length ? progress.reduce((total, value) => total + value, 0) / progress.length : null };
	});

	return <PortalLayout viewer={viewer} activeKey="courses"><CoursesManager courses={courses} /></PortalLayout>;
}