"use client";

import { FileDown } from "lucide-react";
import { jsPDF } from "jspdf";

export type CourseCertificate = {
  courseTitle: string;
  employeeName: string;
  completedAt: string;
  certificateNumber: string;
};

export function formatCertificateDate(date: string) {
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date(date));
}

export function downloadCourseCertificate(certificate: CourseCertificate) {
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
  const center = 148.5;
  const date = formatCertificateDate(certificate.completedAt);

  pdf.setFillColor(246, 248, 244);
  pdf.rect(0, 0, 297, 210, "F");
  pdf.setFillColor(31, 110, 86);
  pdf.rect(8, 8, 281, 194, "F");
  pdf.setFillColor(255, 255, 255);
  pdf.rect(11, 11, 275, 188, "F");
  pdf.setTextColor(31, 110, 86);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(15);
  pdf.text("BEARS HELADOS", center, 39, { align: "center" });

  pdf.setTextColor(25, 37, 32);
  pdf.setFontSize(28);
  pdf.text("Constancia de finalización", center, 65, { align: "center" });
  pdf.setDrawColor(218, 230, 221);
  pdf.line(76, 73, 221, 73);

  pdf.setTextColor(107, 117, 110);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(12);
  pdf.text("Se certifica que", center, 91, { align: "center" });
  pdf.setTextColor(25, 37, 32);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(22);
  pdf.text(pdf.splitTextToSize(certificate.employeeName, 220), center, 105, {
    align: "center",
  });
  pdf.setTextColor(107, 117, 110);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(12);
  pdf.text("completó satisfactoriamente el curso", center, 122, {
    align: "center",
  });
  pdf.setTextColor(31, 110, 86);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(18);
  pdf.text(pdf.splitTextToSize(certificate.courseTitle, 240), center, 137, {
    align: "center",
  });

  pdf.setDrawColor(218, 230, 221);
  pdf.line(44, 153, 253, 153);
  pdf.setTextColor(70, 80, 73);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.text(`Fecha y hora: ${date}`, 51, 169);
  pdf.text(`N.º de constancia: ${certificate.certificateNumber}`, 51, 181);
  pdf.setTextColor(107, 117, 110);
  pdf.setFontSize(9);
  pdf.text("Capacitación y desarrollo · Bears Helados", 246, 181, {
    align: "right",
  });

  const safeName = certificate.courseTitle
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  pdf.save(`constancia-${safeName || "curso"}.pdf`);
}

export function CertificateDownload({
  courseTitle,
  employeeName,
  completedAt,
  certificateNumber,
}: CourseCertificate) {
  return (
    <button
      className="inline-flex h-10 items-center gap-2 rounded-sm border px-3 text-sm font-medium transition-colors hover:bg-surface"
      type="button"
      onClick={() =>
        downloadCourseCertificate({
          courseTitle,
          employeeName,
          completedAt,
          certificateNumber,
        })
      }
    >
      <FileDown className="size-4" aria-hidden="true" />
      Descargar constancia
    </button>
  );
}
