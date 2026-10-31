import { requirePortalRole } from "@/lib/auth/roles";
import { PortalLayout } from "@/components/portal/portal-layout";
import { AIWorkspace } from "@/components/admin/ai-workspace";

export const dynamic = "force-dynamic";
export default async function AIPage() {
  const viewer = await requirePortalRole(["admin"]);
  return <PortalLayout viewer={viewer} activeKey="ai"><AIWorkspace /></PortalLayout>;
}
