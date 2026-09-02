import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";

export async function GET(_: Request, { params }: { params: Promise<{ manualId: string }> }) {
  const viewer = await getViewer();
  if (!viewer || (viewer.role !== "admin" && viewer.role !== "franquiciado")) {
    return NextResponse.json({ error: "No tenés permiso para descargar manuales." }, { status: 403 });
  }

  const { manualId } = await params;
  const supabase = await createClient();
  const { data: manual } = await supabase.from("manuals")
    .select("id, storage_path")
    .eq("id", manualId)
    .single();
  if (!manual?.storage_path) return NextResponse.json({ error: "El archivo no está disponible." }, { status: 404 });

  const { data: signedFile, error } = await supabase.storage
    .from("manuals")
    .createSignedUrl(manual.storage_path, 60);
  if (error || !signedFile) return NextResponse.json({ error: "No pudimos preparar el archivo." }, { status: 500 });

  await supabase.from("manual_downloads").insert({ manual_id: manual.id, user_id: viewer.id });
  return NextResponse.redirect(signedFile.signedUrl);
}