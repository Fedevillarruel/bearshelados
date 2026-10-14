import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/roles";
import { commerceHref } from "@/lib/commerce/sections";

export const dynamic = "force-dynamic";

export default async function CommercePage() {
  await requireRole(["admin"]);
  redirect(commerceHref("resumen"));
}
