import { redirect } from "next/navigation";
import { TrainingDashboard } from "@/components/reporting/training-reports";
import { PortalShell } from "@/components/portal/portal-shell";
import { PortalLayout } from "@/components/portal/portal-layout";
import { requireRole } from "@/lib/auth/roles";
import { getTrainingOverview } from "@/lib/platform/reporting";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export default async function FranchiseDashboardPage() {
	if (!isSupabaseConfigured()) return <PortalShell role="franquiciado" view="dashboard" />;
	const viewer = await requireRole(["franquiciado"]);
	if (!viewer.franchiseId) redirect("/login");
	const [overview, { data: franchise }] = await Promise.all([
		getTrainingOverview({ franchiseId: viewer.franchiseId }),
		(await createClient()).from("franchises").select("name").eq("id", viewer.franchiseId).maybeSingle(),
	]);
	return <PortalLayout viewer={viewer} activeKey="dashboard"><TrainingDashboard overview={overview} title={franchise?.name ?? "Mi franquicia"} description="Seguimiento de cursos y actividad de tu equipo." teamHref="/franquicia/equipo" /></PortalLayout>;
}