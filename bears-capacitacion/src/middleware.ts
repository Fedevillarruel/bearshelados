import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

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
  const isProtected = protectedRoutes.some((route) => pathname.startsWith(route));
  const { data: { user } } = await supabase.auth.getUser();

  if (isProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
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
    return NextResponse.redirect(url);
  }

  if (profile.must_change_password && pathname !== "/cambiar-contrasena" && pathname !== "/auth/callback") {
    const url = request.nextUrl.clone();
    url.pathname = "/cambiar-contrasena";
    return NextResponse.redirect(url);
  }

  const invalidRoute =
    (pathname.startsWith("/admin") && profile.role !== "admin") ||
    (pathname.startsWith("/admin/tiendanube") && !profile.is_super_admin) ||
    (pathname.startsWith("/franquicia") && profile.role !== "franquiciado") ||
    (pathname.startsWith("/cursos") && profile.role !== "empleado");

  if (invalidRoute) {
    const url = request.nextUrl.clone();
    url.pathname = profile.role === "admin" ? "/admin/dashboard" : profile.role === "franquiciado" ? "/franquicia/dashboard" : "/cursos/mis-cursos";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp)$).*)"],
};