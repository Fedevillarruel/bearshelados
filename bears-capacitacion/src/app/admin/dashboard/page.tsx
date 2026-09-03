import { TrainingDashboard } from "@/components/reporting/training-reports";
import { PortalShell } from "@/components/portal/portal-shell";
import { PortalLayout } from "@/components/portal/portal-layout";
import { requireRole } from "@/lib/auth/roles";
import { getTrainingOverview } from "@/lib/platform/reporting";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export default async function AdminDashboardPage() {
	if (!isSupabaseConfigured()) return <PortalShell role="admin" view="dashboard" />;
	const viewer = await requireRole(["admin"]);
	const overview = await getTrainingOverview();
	return <PortalLayout viewer={viewer} activeKey="dashboard"><TrainingDashboard overview={overview} title="Resumen general" description="Estado de capacitación en toda la operación." teamHref="/admin/usuarios" /></PortalLayout>;
}