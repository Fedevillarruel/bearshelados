import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function internalDestination(value: string | null, origin: string) {
  if (!value) return "/";
  try {
    const destination = new URL(value, origin);
    if (destination.origin !== origin || !destination.pathname.startsWith("/")) return "/";
    return `${destination.pathname}${destination.search}${destination.hash}`;
  } catch {
    return "/";
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const destination = internalDestination(url.searchParams.get("next"), url.origin);

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return NextResponse.redirect(new URL("/recuperar-contrasena?error=enlace-invalido", url.origin));
  }

  return NextResponse.redirect(new URL(destination, url.origin));
}