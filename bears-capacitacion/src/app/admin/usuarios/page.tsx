import { UsersManager } from "@/components/admin/users-manager";
import { PortalShell } from "@/components/portal/portal-shell";
import { PortalLayout } from "@/components/portal/portal-layout";
import { requireRole } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export default async function AdminUsersPage() {
	if (!isSupabaseConfigured()) return <PortalShell role="admin" view="users" />;

	const viewer = await requireRole(["admin"]);
	const supabase = await createClient();
	const [{ data: profileData }, { data: franchiseData }] = await Promise.all([
		supabase.from("profiles").select("id, email, full_name, role, franchise_id, position, phone, is_active, must_change_password").order("full_name"),
		supabase.from("franchises").select("id, name, code").order("name"),
	]);
	const users = (profileData ?? []).map((profile) => ({ id: profile.id, email: profile.email, fullName: profile.full_name, role: profile.role as "admin" | "franquiciado" | "empleado", franchiseId: profile.franchise_id, position: profile.position, phone: profile.phone, isActive: profile.is_active, mustChangePassword: profile.must_change_password }));
	const franchises = franchiseData ?? [];

	return <PortalLayout viewer={viewer} activeKey="users"><UsersManager users={users} franchises={franchises} /></PortalLayout>;
}