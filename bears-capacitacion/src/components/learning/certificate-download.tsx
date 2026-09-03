"use client";

import { FileDown } from "lucide-react";
import { jsPDF } from "jspdf";

type CertificateDownloadProps = {
  courseTitle: string;
  employeeName: string;
  completedAt: string | null;
};

export function CertificateDownload({ courseTitle, employeeName, completedAt }: CertificateDownloadProps) {
  function downloadCertificate() {
    const document = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
    const date = completedAt ? new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "long", year: "numeric" }).format(new Date(completedAt)) : new Intl.DateTimeFormat("es-AR").format(new Date());
    document.setFillColor(31, 110, 86);
    document.rect(0, 0, 297, 210, "F");
    document.setFillColor(255, 255, 255);
    document.rect(12, 12, 273, 186, "F");
    document.setTextColor(31, 110, 86);
    document.setFontSize(16);
    document.text("BEARS HELADOS", 148.5, 42, { align: "center" });
    document.setTextColor(10, 10, 10);
    document.setFontSize(30);
    document.text("Certificado de finalización", 148.5, 70, { align: "center" });
    document.setFontSize(13);
    document.setTextColor(107, 107, 104);
    document.text("Se certifica que", 148.5, 91, { align: "center" });
    document.setFontSize(23);
    document.setTextColor(10, 10, 10);
    document.text(employeeName, 148.5, 109, { align: "center" });
    document.setFontSize(13);
    document.setTextColor(107, 107, 104);
    document.text("completó satisfactoriamente el curso", 148.5, 126, { align: "center" });
    document.setFontSize(18);
    document.setTextColor(31, 110, 86);
    document.text(courseTitle, 148.5, 142, { align: "center" });
    document.setFontSize(11);
    document.setTextColor(107, 107, 104);
    document.text(`Emitido el ${date}`, 148.5, 169, { align: "center" });
    document.save(`certificado-${courseTitle.toLowerCase().replace(/[^a-z0-9]+/gi, "-")}.pdf`);
  }

  return <button className="inline-flex h-10 items-center gap-2 rounded-sm border px-3 text-sm font-medium transition-colors hover:bg-surface" type="button" onClick={downloadCertificate}><FileDown className="size-4" aria-hidden="true" />Certificado</button>;
}