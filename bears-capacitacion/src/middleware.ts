import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_PREVIEW_COOKIE, isPreviewRole } from "@/lib/auth/preview";
import { databaseUuid } from "@/lib/validations/ids";

const protectedRoutes = ["/admin", "/franquicia", "/cursos"];

export async function middleware(request: NextRequest) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const pathname = request.nextUrl.pathname;
  const redirectWithSession = (url: URL) => {
    const redirected = NextResponse.redirect(url);
    response.cookies.getAll().forEach((cookie) => redirected.cookies.set(cookie));
    return redirected;
  };
  const isProtected = protectedRoutes.some((route) => pathname.startsWith(route));
  const { data: { user } } = await supabase.auth.getUser();

  if (isProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return redirectWithSession(url);
  }

  if (!user) return response;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_active, must_change_password, is_super_admin")
    .eq("id", user.id)
    .single();

  if (!profile?.is_active) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return redirectWithSession(url);
  }

  if (profile.must_change_password && pathname !== "/cambiar-contrasena" && pathname !== "/auth/callback") {
    const url = request.nextUrl.clone();
    url.pathname = "/cambiar-contrasena";
    return redirectWithSession(url);
  }

  let portalRole = profile.role;
  const previewId = request.cookies.get(ADMIN_PREVIEW_COOKIE)?.value;
  if (profile.role === "admin" && databaseUuid.safeParse(previewId).success) {
    const { data: target, error } = await supabase.from("profiles")
      .select("role, is_active")
      .eq("id", previewId!)
      .maybeSingle();
    if (error) {
      const unavailable = NextResponse.json({ error: "No pudimos verificar la vista seleccionada." }, { status: 503, headers: { "Cache-Control": "no-store" } });
      response.cookies.getAll().forEach((cookie) => unavailable.cookies.set(cookie));
      return unavailable;
    }
    if (target?.is_active && isPreviewRole(target.role)) portalRole = target.role;
  }

  const invalidRoute =
    (pathname.startsWith("/admin") && profile.role !== "admin") ||
    (pathname.startsWith("/admin/tiendanube") && !profile.is_super_admin) ||
    (pathname.startsWith("/franquicia") && portalRole !== "franquiciado") ||
    (pathname.startsWith("/cursos") && !["empleado", "franquiciado"].includes(portalRole));

  if (invalidRoute) {
    const url = request.nextUrl.clone();
    url.pathname = portalRole === "admin" ? "/admin/dashboard" : portalRole === "franquiciado" ? "/franquicia/dashboard" : "/cursos/mis-cursos";
    return redirectWithSession(url);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp)$).*)"],
};