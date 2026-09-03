import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth/roles";
import { getTrainingOverview } from "@/lib/platform/reporting";

function csvCell(value: string | number | null) {
  const text = String(value ?? "");
  const safeText = /^[\t\r\n ]*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safeText.replaceAll("\"", "\"\"")}"`;
}

export async function GET() {
  const viewer = await getViewer();
  if (!viewer || (viewer.role !== "admin" && viewer.role !== "franquiciado")) {
    return NextResponse.json({ error: "No tenés permiso para exportar este reporte." }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }
  if (viewer.role === "franquiciado" && !viewer.franchiseId) {
    return NextResponse.json({ error: "Tu cuenta no tiene una franquicia asignada." }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }

  const overview = await getTrainingOverview({ franchiseId: viewer.role === "franquiciado" ? viewer.franchiseId : undefined });
  const headers = ["Nombre", "Correo", "Puesto", "Franquicia", "Cursos completados", "Cursos asignados", "Progreso promedio", "Nota promedio", "Minutos de video", "Última actividad", "Estado"];
  const rows = overview.team.map((member) => [
    member.fullName ?? "",
    member.email,
    member.position ?? "",
    member.franchiseName ?? "",
    member.completedCourses,
    member.assignedCourses,
    `${Math.round(member.averageProgress)}%`,
    member.averageScore?.toFixed(1) ?? "",
    member.watchedMinutes,
    member.lastSeenAt ?? "",
    member.status,
  ].map(csvCell).join(","));
  const fileName = viewer.role === "admin" ? "reporte-capacitacion-bears.csv" : "reporte-capacitacion-franquicia.csv";
  return new NextResponse(`\uFEFF${[headers.map(csvCell).join(","), ...rows].join("\n")}`, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Content-Type": "text/csv; charset=utf-8",
    },
  });
}