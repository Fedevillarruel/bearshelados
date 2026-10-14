import { redirect } from "next/navigation";
import { TeamReportTable } from "@/components/reporting/training-reports";
import { PortalShell } from "@/components/portal/portal-shell";
import { PortalLayout } from "@/components/portal/portal-layout";
import { requirePortalRole } from "@/lib/auth/roles";
import { getTrainingOverview } from "@/lib/platform/reporting";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export default async function FranchiseTeamPage() {
	if (!isSupabaseConfigured()) return <PortalShell role="franquiciado" view="team" />;
	const viewer = await requirePortalRole(["franquiciado"]);
	if (!viewer.franchiseId) {
		if (viewer.previewAdminId) return <PortalLayout viewer={viewer} activeKey="team"><p>Este usuario no tiene una franquicia asignada.</p></PortalLayout>;
		redirect("/login");
	}
	const overview = await getTrainingOverview({ franchiseId: viewer.franchiseId });
	return <PortalLayout viewer={viewer} activeKey="team"><TeamReportTable team={overview.team} showFranchise={false} title="Mi equipo" description="Progreso, evaluaciones y actividad de las personas asignadas a tu franquicia." /></PortalLayout>;
}