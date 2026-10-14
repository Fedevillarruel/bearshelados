export const ADMIN_PREVIEW_COOKIE = "bears-admin-preview";

export function isPreviewRole(role: unknown): role is "empleado" | "franquiciado" {
  return role === "empleado" || role === "franquiciado";
}
