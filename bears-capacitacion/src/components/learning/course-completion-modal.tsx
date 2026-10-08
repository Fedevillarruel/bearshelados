"use client";

import { useEffect } from "react";
import { Check, Download, X } from "lucide-react";
import {
  downloadCourseCertificate,
  formatCertificateDate,
  type CourseCertificate,
} from "@/components/learning/certificate-download";

export function CourseCompletionModal({
  certificate,
  onClose,
}: {
  certificate: CourseCertificate;
  onClose: () => void;
}) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/60 p-4 backdrop-blur-sm">
      <section
        className="relative w-full max-w-lg overflow-hidden rounded-xl border border-line bg-paper p-6 shadow-2xl sm:p-9"
        role="dialog"
        aria-modal="true"
        aria-labelledby="course-completion-title"
      >
        <button
          className="absolute right-4 top-4 grid size-9 place-items-center rounded-full text-muted transition-colors hover:bg-surface hover:text-ink"
          type="button"
          onClick={onClose}
          aria-label="Cerrar felicitación"
        >
          <X className="size-5" aria-hidden="true" />
        </button>
        <span className="grid size-14 place-items-center rounded-full bg-[#E0F1EB] text-jade-deep">
          <Check className="size-7" strokeWidth={2.5} aria-hidden="true" />
        </span>
        <p className="mt-6 font-tabular text-xs tracking-[0.16em] text-jade-deep">
          ¡LO LOGRASTE!
        </p>
        <h2
          className="mt-2 text-3xl font-medium leading-tight"
          id="course-completion-title"
        >
          Curso {certificate.courseTitle} finalizado, ¡felicidades!
        </h2>
        <p className="mt-3 text-sm leading-6 text-muted">
          {certificate.employeeName}, completaste tu capacitación. Tu constancia
          ya está lista para descargar.
        </p>
        <dl className="mt-7 divide-y divide-line rounded-lg border border-line bg-surface px-4">
          <div className="flex flex-wrap justify-between gap-2 py-3">
            <dt className="text-sm text-muted">Fecha y hora</dt>
            <dd className="text-right text-sm font-medium">
              {formatCertificateDate(certificate.completedAt)}
            </dd>
          </div>
          <div className="flex flex-wrap justify-between gap-2 py-3">
            <dt className="text-sm text-muted">N.º de constancia</dt>
            <dd className="break-all text-right font-mono text-xs font-medium">
              {certificate.certificateNumber}
            </dd>
          </div>
        </dl>
        <button
          className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-jade px-4 text-sm font-semibold text-white transition-colors hover:bg-jade-deep"
          type="button"
          onClick={() => downloadCourseCertificate(certificate)}
        >
          <Download className="size-4" aria-hidden="true" />
          Descargar constancia PDF
        </button>
        <button
          className="mt-3 h-11 w-full rounded-lg border border-line px-4 text-sm font-medium transition-colors hover:bg-surface"
          type="button"
          onClick={onClose}
        >
          Seguir usando la plataforma
        </button>
      </section>
    </div>
  );
}
