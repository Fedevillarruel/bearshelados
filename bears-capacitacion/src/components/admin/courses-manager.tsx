"use client";

import { startTransition, useState, type ChangeEvent } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookOpen, ChevronRight, ImageIcon, Pencil, Plus, Trash2, Upload, X } from "lucide-react";
import { createCourseCoverUploadUrl, deleteCourse, saveCourse } from "@/app/actions/courses";
import { courseCoverFileAccept, detectCourseCoverFile, type PendingCourseAssetFile } from "@/lib/course-asset-files";
import { uploadPrivateFile } from "@/lib/supabase/resumable-upload";

export type ManagedCourse = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  summary: string | null;
  coverUrl: string | null;
  coverStoragePath: string | null;
  category: string | null;
  estimatedMinutes: number;
  isPublished: boolean;
  orderIndex: number;
  moduleCount: number;
  enrollmentCount: number;
  completionPercent: number | null;
};

const courseFormSchema = z.object({
  title: z.string().trim().min(3, "El título debe tener al menos 3 caracteres.").max(160),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Usá minúsculas, números y guiones.").max(180),
  description: z.string().trim().max(5_000),
  summary: z.string().trim().max(500),
  coverUrl: z.union([z.literal(""), z.string().trim().url("Ingresá una URL válida.").refine((value) => value.startsWith("https://"), "La URL debe usar HTTPS.")]),
  category: z.string().trim().max(100),
  isPublished: z.boolean(),
});

type CourseFormValues = z.infer<typeof courseFormSchema>;

function slugify(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function CourseForm({ course, nextOrderIndex, onClose }: { course?: ManagedCourse; nextOrderIndex: number; onClose: () => void }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const form = useForm<CourseFormValues>({
    resolver: zodResolver(courseFormSchema),
    defaultValues: {
      title: course?.title ?? "",
      slug: course?.slug ?? "",
      description: course?.description ?? "",
      summary: course?.summary ?? "",
      coverUrl: course?.coverUrl ?? "",
      category: course?.category ?? "",
      isPublished: course?.isPublished ?? false,
    },
  });
  const [coverFile, setCoverFile] = useState<PendingCourseAssetFile | null>(null);
  const [removeCover, setRemoveCover] = useState(false);

  function handleCoverFile(event: ChangeEvent<HTMLInputElement>) {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;
    const detected = detectCourseCoverFile(selectedFile);
    if (!detected) {
      setCoverFile(null);
      setError("La portada debe ser una imagen JPEG, PNG, WebP o GIF.");
      return;
    }
    setError(null);
    setCoverFile(detected);
    setRemoveCover(false);
    form.setValue("coverUrl", "", { shouldValidate: true });
  }

  async function uploadCover(courseId: string, file: PendingCourseAssetFile) {
    const signedUpload = await createCourseCoverUploadUrl({
      courseId,
      fileName: file.file.name,
      contentType: file.contentType,
      fileSize: file.file.size,
    });
    if ("error" in signedUpload && signedUpload.error) return { error: signedUpload.error };
    if (!("data" in signedUpload) || !signedUpload.data) return { error: "No pudimos preparar la subida de la portada." };
    try {
      await uploadPrivateFile({ bucket: "course-media", path: signedUpload.data.path, token: signedUpload.data.token, file: file.file, contentType: file.contentType });
      return { data: signedUpload.data.path };
    } catch {
      return { error: "No pudimos subir la portada." };
    }
  }

  function submit(values: CourseFormValues) {
    setError(null);
    setSaving(true);
    startTransition(async () => {
      let coverStoragePath = values.coverUrl || removeCover ? null : course?.coverStoragePath ?? null;
      let coverUrl = values.coverUrl || null;
      if (course && coverFile) {
        const upload = await uploadCover(course.id, coverFile);
        if ("error" in upload && upload.error) {
          setSaving(false);
          setError(`No pudimos cargar la portada: ${upload.error}`);
          return;
        }
        coverStoragePath = "data" in upload ? upload.data ?? null : null;
        coverUrl = null;
      }
      const response = await saveCourse({
        id: course?.id,
        title: values.title,
        slug: values.slug,
        description: values.description || null,
        summary: values.summary || null,
        coverUrl,
        coverStoragePath,
        category: values.category || null,
        isPublished: values.isPublished,
        orderIndex: course?.orderIndex ?? nextOrderIndex,
      });
      if ("error" in response && response.error) {
        setSaving(false);
        setError(response.error);
        return;
      }
      if (!("data" in response) || !response.data) {
        setSaving(false);
        setError("No pudimos guardar el curso.");
        return;
      }
      if (!course && coverFile) {
        const upload = await uploadCover(response.data.id, coverFile);
        if ("error" in upload && upload.error) {
          setSaving(false);
          setError(`El curso se guardó, pero no pudimos cargar la portada: ${upload.error}`);
          return;
        }
        const savedCover = await saveCourse({
          id: response.data.id,
          title: values.title,
          slug: values.slug,
          description: values.description || null,
          summary: values.summary || null,
          coverUrl: null,
          coverStoragePath: "data" in upload ? upload.data ?? null : null,
          category: values.category || null,
          isPublished: values.isPublished,
          orderIndex: nextOrderIndex,
        });
        if ("error" in savedCover && savedCover.error) {
          setSaving(false);
          setError(`El curso se guardó, pero no pudimos asignar la portada: ${savedCover.error}`);
          return;
        }
      }
      setSaving(false);
      if (course) {
        router.refresh();
        onClose();
      } else router.push(`/admin/cursos/${response.data.id}`);
    });
  }

  const coverUrl = form.register("coverUrl");

  return <form className="grid gap-4" onSubmit={form.handleSubmit(submit)}><div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)]"><label className="grid gap-2 text-sm font-medium" htmlFor="course-title">Título<input id="course-title" className="h-11 rounded-sm border bg-paper px-3 text-sm outline-none focus:border-jade" {...form.register("title")} onBlur={(event) => { form.register("title").onBlur(event); if (!form.getValues("slug")) form.setValue("slug", slugify(event.target.value), { shouldValidate: true }); }} /></label><label className="grid gap-2 text-sm font-medium" htmlFor="course-slug">Identificador<input id="course-slug" className="h-11 rounded-sm border bg-paper px-3 text-sm outline-none focus:border-jade" {...form.register("slug")} /></label></div><label className="grid gap-2 text-sm font-medium" htmlFor="course-summary">Resumen<input id="course-summary" className="h-11 rounded-sm border bg-paper px-3 text-sm outline-none focus:border-jade" {...form.register("summary")} /></label><label className="grid gap-2 text-sm font-medium" htmlFor="course-description">Descripción<textarea id="course-description" className="min-h-28 resize-y rounded-sm border bg-paper px-3 py-2 text-sm outline-none focus:border-jade" {...form.register("description")} /></label><label className="grid gap-2 text-sm font-medium" htmlFor="course-category">Categoría<input id="course-category" className="h-11 rounded-sm border bg-paper px-3 text-sm outline-none focus:border-jade" {...form.register("category")} /></label><label className="grid gap-2 text-sm font-medium" htmlFor="course-cover">URL externa de portada<input id="course-cover" className="h-11 rounded-sm border bg-paper px-3 text-sm outline-none focus:border-jade" type="url" placeholder="https://" {...coverUrl} onChange={(event) => { coverUrl.onChange(event); if (event.target.value) { setCoverFile(null); setRemoveCover(true); } }} /></label><section className="border border-dashed border-line bg-surface p-4"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-medium">Portada adjunta</p><p className="mt-1 text-xs leading-5 text-muted">JPEG, PNG, WebP o GIF. Se entrega de forma privada a las personas con acceso al curso.</p></div>{course?.coverStoragePath && !removeCover && !coverFile ? <button className="h-8 rounded-sm border bg-paper px-3 text-xs hover:bg-surface" type="button" onClick={() => setRemoveCover(true)}>Quitar portada</button> : null}</div><label className="mt-4 inline-flex h-10 cursor-pointer items-center gap-2 rounded-sm border bg-paper px-3 text-sm font-medium transition-colors hover:bg-paper" htmlFor="course-cover-file"><Upload className="size-4" aria-hidden="true" />Seleccionar imagen<input id="course-cover-file" className="sr-only" type="file" accept={courseCoverFileAccept} onChange={handleCoverFile} /></label>{coverFile ? <p className="mt-3 flex items-center gap-2 text-xs text-muted"><ImageIcon className="size-4" aria-hidden="true" />{coverFile.file.name}</p> : course?.coverStoragePath && !removeCover ? <p className="mt-3 flex items-center gap-2 text-xs text-muted"><ImageIcon className="size-4" aria-hidden="true" />Portada privada adjunta</p> : null}</section><label className="flex min-h-11 items-center gap-3 text-sm"><input className="size-4 accent-jade" type="checkbox" {...form.register("isPublished")} />Publicar y habilitar asignaciones</label>{Object.values(form.formState.errors).map((fieldError) => fieldError?.message ? <p className="text-sm text-alert" role="alert" key={fieldError.message}>{fieldError.message}</p> : null)}{error ? <p className="rounded-sm bg-[#FCEAE6] px-3 py-2 text-sm text-alert" role="alert">{error}</p> : null}<div className="mt-2 flex justify-end gap-3"><button className="h-11 rounded-sm border px-4 text-sm" type="button" onClick={onClose} disabled={saving}>Cancelar</button><button className="h-11 rounded-sm bg-jade px-4 text-sm font-medium text-white hover:bg-jade-deep disabled:opacity-60" type="submit" disabled={saving}>{saving ? "Guardando" : course ? "Guardar cambios" : "Crear y continuar"}</button></div></form>;
}

export function CoursesManager({ courses }: { courses: ManagedCourse[] }) {
  const router = useRouter();
  const [open, setOpen] = useState<"create" | ManagedCourse | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const nextOrderIndex = Math.max(0, ...courses.map((course) => course.orderIndex)) + 1;

  function remove(course: ManagedCourse) {
    if (!window.confirm(`¿Eliminar “${course.title}”? También se eliminarán sus módulos, contenidos, evaluaciones y asignaciones.`)) return;
    setNotice(null);
    startTransition(async () => {
      const response = await deleteCourse(course.id);
      if ("error" in response && response.error) setNotice(response.error);
      else router.refresh();
    });
  }

  return <><header className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm text-muted">Gestión académica</p><h1 className="mt-2 text-[31px] font-medium leading-tight">Cursos</h1><p className="mt-2 text-sm text-muted">Contenido, módulos, evaluaciones y asignaciones.</p></div><button className="inline-flex h-10 items-center gap-2 rounded-sm bg-jade px-4 text-sm font-medium text-white transition-colors hover:bg-jade-deep" type="button" onClick={() => setOpen("create")}><Plus className="size-4" aria-hidden="true" />Nuevo curso</button></header>{notice ? <p className="mt-5 rounded-sm bg-[#FCEAE6] px-3 py-2 text-sm text-alert" role="alert">{notice}</p> : null}{courses.length ? <section className="mt-8 divide-y divide-line border border-line bg-paper">{courses.map((course) => <article className="flex flex-wrap items-center justify-between gap-5 p-5" key={course.id}><div className="flex min-w-0 items-center gap-4"><div className="grid size-12 shrink-0 place-items-center bg-surface"><BookOpen className="size-5 text-jade-deep" aria-hidden="true" /></div><div className="min-w-0"><p className="text-xs text-muted">{course.category ?? "Capacitación"}</p><h2 className="mt-1 truncate font-medium">{course.title}</h2><p className="mt-1 text-sm text-muted">{course.moduleCount} módulos · {course.enrollmentCount} personas asignadas · {course.estimatedMinutes} min</p></div></div><div className="ml-auto flex flex-wrap items-center justify-end gap-3"><div className="hidden w-32 sm:block"><p className="mb-1 flex justify-between text-xs text-muted"><span>Finalización</span><span className="font-tabular">{course.completionPercent === null ? "-" : `${Math.round(course.completionPercent)}%`}</span></p><div className="h-1.5 bg-surface"><div className="h-full bg-jade" style={{ width: `${Math.max(0, Math.min(100, course.completionPercent ?? 0))}%` }} /></div></div><span className={`inline-flex rounded-sm px-2 py-1 text-xs font-medium ${course.isPublished ? "bg-[#E0F1EB] text-jade-deep" : "bg-surface text-muted"}`}>{course.isPublished ? "Publicado" : "Borrador"}</span><button className="grid size-10 place-items-center rounded-sm border transition-colors hover:bg-surface" type="button" aria-label={`Editar ${course.title}`} title="Editar curso" onClick={() => setOpen(course)}><Pencil className="size-4" aria-hidden="true" /></button><button className="grid size-10 place-items-center rounded-sm border text-alert transition-colors hover:bg-[#FCEAE6]" type="button" aria-label={`Eliminar ${course.title}`} title="Eliminar curso" onClick={() => remove(course)}><Trash2 className="size-4" aria-hidden="true" /></button><Link href={`/admin/cursos/${course.id}`} className="inline-flex h-10 items-center gap-2 rounded-sm bg-jade px-3 text-sm font-medium text-white hover:bg-jade-deep">Gestionar <ChevronRight className="size-4" aria-hidden="true" /></Link></div></article>)}</section> : <section className="mt-8 border border-dashed border-line bg-surface p-8"><BookOpen className="size-6 text-jade" aria-hidden="true" /><h2 className="mt-5 text-lg font-medium">Todavía no creaste cursos</h2><p className="mt-2 max-w-md text-sm leading-6 text-muted">Creá el primero para incorporar módulos, contenidos, evaluaciones y personas asignadas.</p><button className="mt-6 inline-flex h-10 items-center gap-2 rounded-sm bg-jade px-4 text-sm font-medium text-white hover:bg-jade-deep" type="button" onClick={() => setOpen("create")}><Plus className="size-4" aria-hidden="true" />Nuevo curso</button></section>}{open ? <div className="fixed inset-0 z-30 grid place-items-center bg-ink/40 p-5" role="presentation"><section className="max-h-[90vh] w-full max-w-3xl overflow-y-auto border border-line bg-paper p-5 shadow-xl sm:p-6" role="dialog" aria-modal="true" aria-labelledby="course-dialog-title"><div className="mb-6 flex items-start justify-between gap-4"><div><h2 className="text-xl font-medium" id="course-dialog-title">{open === "create" ? "Nuevo curso" : "Editar curso"}</h2><p className="mt-1 text-sm text-muted">Definí la información general antes de administrar el contenido.</p></div><button className="grid size-10 place-items-center rounded-sm hover:bg-surface" type="button" onClick={() => setOpen(null)} aria-label="Cerrar"><X className="size-5" aria-hidden="true" /></button></div><CourseForm course={open === "create" ? undefined : open} nextOrderIndex={nextOrderIndex} onClose={() => setOpen(null)} /></section></div> : null}</>;
}