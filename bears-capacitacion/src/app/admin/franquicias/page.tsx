import { FranchisesManager, type ManagedFranchise } from "@/components/admin/franchises-manager";
import { PortalShell } from "@/components/portal/portal-shell";
import { PortalLayout } from "@/components/portal/portal-layout";
import { requireRole } from "@/lib/auth/roles";
import { getTrainingOverview } from "@/lib/platform/reporting";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export default async function AdminFranchisesPage() {
	if (!isSupabaseConfigured()) return <PortalShell role="admin" view="franchises" />;
	const viewer = await requireRole(["admin"]);
	const overview = await getTrainingOverview();
	const franchises: ManagedFranchise[] = overview.franchises.map((franchise) => ({
		id: franchise.id,
		name: franchise.name,
		code: franchise.code,
		city: franchise.city,
		isActive: franchise.isActive,
		employeeCount: franchise.employeeCount,
		averageProgress: franchise.averageProgress,
		averageScore: franchise.averageScore,
	}));
	return <PortalLayout viewer={viewer} activeKey="franchises"><FranchisesManager franchises={franchises} /></PortalLayout>;
}