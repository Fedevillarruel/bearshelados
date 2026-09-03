import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { databaseUuid } from "@/lib/validations/ids";

function json(body: Record<string, string>, status: number) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(_: Request, { params }: { params: Promise<{ manualId: string }> }) {
  const viewer = await getViewer();
  if (!viewer || (viewer.role !== "admin" && viewer.role !== "franquiciado")) {
    return json({ error: "No tenés permiso para descargar manuales." }, 403);
  }

  const { manualId } = await params;
  if (!databaseUuid.safeParse(manualId).success) return json({ error: "El manual seleccionado no es válido." }, 400);

  const supabase = await createClient();
  const { data: manual } = await supabase.from("manuals")
    .select("id, storage_path")
    .eq("id", manualId)
    .single();
  if (!manual?.storage_path) return json({ error: "El archivo no está disponible." }, 404);

  const { data: signedFile, error } = await supabase.storage
    .from("manuals")
    .createSignedUrl(manual.storage_path, 60);
  if (error || !signedFile) return json({ error: "No pudimos preparar el archivo." }, 500);

  await supabase.from("manual_downloads").insert({ manual_id: manual.id, user_id: viewer.id });
  const response = NextResponse.redirect(signedFile.signedUrl);
  response.headers.set("Cache-Control", "no-store");
  return response;
}