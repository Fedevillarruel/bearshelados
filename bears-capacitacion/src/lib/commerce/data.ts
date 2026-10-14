import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { CommerceFranchisesResult } from "@/lib/commerce/types";

export async function getCommerceFranchises(): Promise<CommerceFranchisesResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("franchises")
    .select("id, name, code, city, is_active")
    .order("name");

  if (error || !data) {
    return { status: "error", message: "No pudimos cargar las franquicias. Reintentá la consulta; no se muestran indicadores de locales mientras falte esta información." };
  }

  return {
    status: "available",
    franchises: data.map((franchise) => ({
      id: franchise.id,
      name: franchise.name,
      code: franchise.code,
      city: franchise.city,
      isActive: franchise.is_active,
    })),
  };
}
