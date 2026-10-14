import { notFound } from "next/navigation";
import { CommerceWorkspace } from "@/components/admin/commerce-workspace";
import { PortalLayout } from "@/components/portal/portal-layout";
import { requireRole } from "@/lib/auth/roles";
import { getCommerceFranchises } from "@/lib/commerce/data";
import { commerceActiveKey, getCommerceSection } from "@/lib/commerce/sections";

export const dynamic = "force-dynamic";

export default async function CommerceSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const viewer = await requireRole(["admin"]);
  const { section: sectionId } = await params;
  const section = getCommerceSection(sectionId);
  if (!section) notFound();
  const franchises = await getCommerceFranchises();

  return <PortalLayout viewer={viewer} activeKey={commerceActiveKey(section.id)}>
    <CommerceWorkspace key={section.id} sectionId={section.id} result={franchises} />
  </PortalLayout>;
}
