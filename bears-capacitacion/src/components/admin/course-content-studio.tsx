"use client";

import {
  startTransition,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  FileSpreadsheet,
  FileText,
  ImageIcon,
  Link2,
  Pencil,
  Plus,
  Text,
  Trash2,
  Upload,
  Video,
  X,
} from "lucide-react";
import {
  createCourseAssetUploadUrl,
  createCourseVideoPosterUploadUrl,
  deleteAsset,
  saveAsset,
} from "@/app/actions/courses";
import {
  courseAssetFileAccept,
  courseCoverFileAccept,
  detectCourseAssetFile,
  detectCourseCoverFile,
  type CourseAssetType,
  type PendingCourseAssetFile,
} from "@/lib/course-asset-files";
import { uploadPrivateFile } from "@/lib/supabase/resumable-upload";

type AssetType = CourseAssetType;

export type CourseContentAsset = {
  id: string;
  courseId: string | null;
  moduleId: string | null;
  type: AssetType;
  isPrimary: boolean;
  title: string;
  description: string | null;
  url: string;
  storagePath: string | null;
  videoPosterStoragePath: string | null;
  durationSeconds: number;
  sizeBytes: number | null;
  orderIndex: number;
};

export type CourseContentModule = {
  id: string;
  title: string;
  orderIndex: number;
  assets: CourseContentAsset[];
};

function optional(value: string) {
  const trimmed = value.trim();
  return trimmed || null;
}

function formatFileSize(sizeBytes: number | null) {
  if (!sizeBytes) return "Archivo privado";
  if (sizeBytes < 1024 * 1024)
    return `${Math.max(1, Math.round(sizeBytes / 1024))} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function assetLabel(type: AssetType) {
  const labels: Record<AssetType, string> = {
    video: "Video",
    pdf: "PDF",
    image: "Imagen",
    spreadsheet: "Planilla",
    document: "Documento",
    text: "Texto",
    link: "Enlace",
  };
  return labels[type];
}

function assetIcon(type: AssetType) {
  if (type === "video") return Video;
  if (type === "pdf" || type === "document") return FileText;
  if (type === "image") return ImageIcon;
  if (type === "spreadsheet") return FileSpreadsheet;
  if (type === "link") return Link2;
  return Text;
}

function Dialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-30 grid place-items-center bg-ink/40 p-5"
      role="presentation"
    >
      <section
        className="max-h-[90vh] w-full max-w-3xl overflow-y-auto border border-line bg-paper p-5 shadow-xl sm:p-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby="course-content-dialog-title"
      >
        <div className="mb-6 flex items-start justify-between gap-4">
          <h2 className="text-xl font-medium" id="course-content-dialog-title">
            {title}
          </h2>
          <button
            className="grid size-10 place-items-center rounded-sm transition-colors hover:bg-surface"
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

function AssetEditor({
  course,
  modules,
  courseAssets,
  asset,
  target,
  onClose,
}: {
  course: { id: string; title: string };
  modules: CourseContentModule[];
  courseAssets: CourseContentAsset[];
  asset?: CourseContentAsset;
  target: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [location, setLocation] = useState(
    asset?.moduleId ?? (asset?.courseId ? "course" : target),
  );
  const [type, setType] = useState<AssetType>(asset?.type ?? "video");
  const [title, setTitle] = useState(asset?.title ?? "");
  const [description, setDescription] = useState(asset?.description ?? "");
  const [source, setSource] = useState(
    asset?.storagePath ? "" : (asset?.url ?? ""),
  );
  const [durationSeconds, setDurationSeconds] = useState(
    String(asset?.durationSeconds ?? 0),
  );
  const [storagePath, setStoragePath] = useState<string | null>(
    asset?.storagePath ?? null,
  );
  const [videoPosterStoragePath, setVideoPosterStoragePath] = useState<
    string | null
  >(asset?.videoPosterStoragePath ?? null);
  const [pendingFile, setPendingFile] = useState<PendingCourseAssetFile | null>(
    null,
  );
  const [pendingPosterFile, setPendingPosterFile] =
    useState<PendingCourseAssetFile | null>(null);
  const [isPrimary, setIsPrimary] = useState(asset?.isPrimary ?? false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const canUpload = type !== "text" && type !== "link";
  const targetAssets =
    location === "course"
      ? courseAssets
      : (modules.find((module) => module.id === location)?.assets ?? []);

  function loadVideoDuration(file: File) {
    const preview = document.createElement("video");
    const objectUrl = URL.createObjectURL(file);
    preview.preload = "metadata";
    preview.onloadedmetadata = () => {
      if (Number.isFinite(preview.duration) && preview.duration > 0)
        setDurationSeconds(String(Math.ceil(preview.duration)));
      URL.revokeObjectURL(objectUrl);
    };
    preview.onerror = () => URL.revokeObjectURL(objectUrl);
    preview.src = objectUrl;
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const selectedFile = event.target.files?.[0] ?? null;
    if (!selectedFile) return;
    const detected = detectCourseAssetFile(selectedFile);
    if (!detected) {
      setPendingFile(null);
      setError(
        "Formato no admitido. Usá MP4, WebM, PDF, imagen, Excel, CSV, Word o PowerPoint.",
      );
      return;
    }
    setError(null);
    setType(detected.type);
    setPendingFile(detected);
    setStoragePath(null);
    setTitle(
      (current) => current.trim() || selectedFile.name.replace(/\.[^.]+$/, ""),
    );
    if (detected.type === "video") loadVideoDuration(selectedFile);
  }

  async function uploadFile(file: PendingCourseAssetFile) {
    const signedUpload = await createCourseAssetUploadUrl({
      courseId: course.id,
      fileName: file.file.name,
      contentType: file.contentType,
      fileSize: file.file.size,
    });
    if ("error" in signedUpload && signedUpload.error)
      return { error: signedUpload.error };
    if (!("data" in signedUpload) || !signedUpload.data)
      return { error: "No pudimos preparar la subida del archivo." };
    try {
      await uploadPrivateFile({
        bucket: "course-media",
        path: signedUpload.data.path,
        token: signedUpload.data.token,
        file: file.file,
        contentType: file.contentType,
      });
      return { data: signedUpload.data.path };
    } catch (error) {
      return {
        error:
          error instanceof Error
            ? error.message
            : "No pudimos subir el archivo.",
      };
    }
  }

  function handlePosterFileChange(event: ChangeEvent<HTMLInputElement>) {
    const selectedFile = event.target.files?.[0] ?? null;
    if (!selectedFile) return;
    const detected = detectCourseCoverFile(selectedFile);
    if (!detected) {
      setPendingPosterFile(null);
      setError(
        "La portada del video debe ser una imagen JPEG, PNG, WebP o GIF.",
      );
      return;
    }
    setError(null);
    setPendingPosterFile(detected);
    setVideoPosterStoragePath(null);
  }

  async function uploadPosterFile(file: PendingCourseAssetFile) {
    const signedUpload = await createCourseVideoPosterUploadUrl({
      courseId: course.id,
      fileName: file.file.name,
      contentType: file.contentType,
      fileSize: file.file.size,
    });
    if ("error" in signedUpload && signedUpload.error)
      return { error: signedUpload.error };
    if (!("data" in signedUpload) || !signedUpload.data)
      return {
        error: "No pudimos preparar la subida de la portada del video.",
      };
    try {
      await uploadPrivateFile({
        bucket: "course-media",
        path: signedUpload.data.path,
        token: signedUpload.data.token,
        file: file.file,
        contentType: file.contentType,
      });
      return { data: signedUpload.data.path };
    } catch (error) {
      return {
        error:
          error instanceof Error
            ? error.message
            : "No pudimos subir la portada del video.",
      };
    }
  }

  function changeType(nextType: AssetType) {
    setType(nextType);
    setPendingFile(null);
    if (nextType !== "video") {
      setIsPrimary(false);
      setPendingPosterFile(null);
      setVideoPosterStoragePath(null);
    }
    if (asset?.storagePath) setStoragePath(null);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    startTransition(async () => {
      let nextStoragePath = storagePath;
      let nextVideoPosterStoragePath =
        type === "video" ? videoPosterStoragePath : null;
      if (pendingFile) {
        const upload = await uploadFile(pendingFile);
        if ("error" in upload && upload.error) {
          setError(upload.error);
          setSaving(false);
          return;
        }
        nextStoragePath = "data" in upload ? (upload.data ?? null) : null;
      }
      if (type === "video" && pendingPosterFile) {
        const upload = await uploadPosterFile(pendingPosterFile);
        if ("error" in upload && upload.error) {
          setError(upload.error);
          setSaving(false);
          return;
        }
        nextVideoPosterStoragePath =
          "data" in upload ? (upload.data ?? null) : null;
      }
      const response = await saveAsset({
        id: asset?.id,
        courseId: location === "course" ? course.id : null,
        moduleId: location === "course" ? null : location,
        type,
        isPrimary: location !== "course" && type === "video" && isPrimary,
        title,
        description: optional(description),
        url: type === "text" ? source : nextStoragePath ? "" : source,
        storagePath: nextStoragePath,
        videoPosterStoragePath: nextVideoPosterStoragePath,
        durationSeconds: Number(durationSeconds),
        sizeBytes: pendingFile?.file.size ?? asset?.sizeBytes ?? null,
        orderIndex:
          asset?.orderIndex ??
          Math.max(0, ...targetAssets.map((item) => item.orderIndex)) + 1,
      });
      setSaving(false);
      if ("error" in response && response.error) {
        setError(response.error);
        return;
      }
      router.refresh();
      onClose();
    });
  }

  return (
    <form className="grid gap-5" onSubmit={submit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <label
          className="grid gap-2 text-sm font-medium"
          htmlFor="content-location"
        >
          Ubicación
          <select
            id="content-location"
            className="h-11 rounded-sm border bg-paper px-3 text-sm"
            value={location}
            onChange={(event) => {
              setLocation(event.target.value);
              if (event.target.value === "course") setIsPrimary(false);
            }}
          >
            <option value="course">Recursos generales del curso</option>
            {modules.map((module, index) => (
              <option value={module.id} key={module.id}>
                Módulo {index + 1}: {module.title}
              </option>
            ))}
          </select>
        </label>
        <label
          className="grid gap-2 text-sm font-medium"
          htmlFor="content-type"
        >
          Tipo de contenido
          <select
            id="content-type"
            className="h-11 rounded-sm border bg-paper px-3 text-sm"
            value={type}
            onChange={(event) => changeType(event.target.value as AssetType)}
          >
            <option value="video">Video</option>
            <option value="pdf">PDF</option>
            <option value="image">Imagen</option>
            <option value="spreadsheet">Planilla Excel o CSV</option>
            <option value="document">Documento</option>
            <option value="text">Texto</option>
            <option value="link">Enlace</option>
          </select>
        </label>
      </div>

      <label className="grid gap-2 text-sm font-medium" htmlFor="content-title">
        Título
        <input
          id="content-title"
          className="h-11 rounded-sm border bg-paper px-3 text-sm outline-none focus:border-jade"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          required
        />
      </label>

      <label
        className="grid gap-2 text-sm font-medium"
        htmlFor="content-description"
      >
        Descripción
        <input
          id="content-description"
          className="h-11 rounded-sm border bg-paper px-3 text-sm outline-none focus:border-jade"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </label>

      {type === "text" ? (
        <label
          className="grid gap-2 text-sm font-medium"
          htmlFor="content-text"
        >
          Contenido
          <textarea
            id="content-text"
            className="min-h-40 resize-y rounded-sm border bg-paper px-3 py-2 text-sm outline-none focus:border-jade"
            value={source}
            onChange={(event) => setSource(event.target.value)}
            required
          />
        </label>
      ) : (
        <label className="grid gap-2 text-sm font-medium" htmlFor="content-url">
          {type === "video" ? "URL de YouTube o video externo" : "URL externa"}
          <input
            id="content-url"
            className="h-11 rounded-sm border bg-paper px-3 text-sm outline-none focus:border-jade"
            type="url"
            placeholder={
              type === "video"
                ? "https://www.youtube.com/watch?v=..."
                : "https://"
            }
            value={source}
            onChange={(event) => {
              setSource(event.target.value);
              if (event.target.value) setStoragePath(null);
            }}
            required={!storagePath && !pendingFile}
          />
        </label>
      )}

      {canUpload ? (
        <section className="border border-dashed border-line bg-surface p-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Archivo privado</p>
              <p className="mt-1 text-xs leading-5 text-muted">
                MP4, WebM, PDF, imágenes, Excel, CSV, Word y PowerPoint. La
                carga se reanuda si la conexión se interrumpe.
              </p>
            </div>
            {storagePath ? (
              <button
                className="h-8 rounded-sm border bg-paper px-3 text-xs hover:bg-surface"
                type="button"
                onClick={() => setStoragePath(null)}
              >
                Quitar archivo
              </button>
            ) : null}
          </div>
          <label className="mt-4 inline-flex h-10 cursor-pointer items-center gap-2 rounded-sm border bg-paper px-3 text-sm font-medium transition-colors hover:bg-surface">
            <Upload className="size-4" aria-hidden="true" />
            Seleccionar archivo
            <input
              className="sr-only"
              type="file"
              accept={courseAssetFileAccept}
              onChange={handleFileChange}
            />
          </label>
          {pendingFile ? (
            <p className="mt-3 text-xs text-muted">
              {pendingFile.file.name} · {formatFileSize(pendingFile.file.size)}{" "}
              · {assetLabel(pendingFile.type)}
            </p>
          ) : null}
          {!pendingFile && storagePath ? (
            <p className="mt-3 text-xs text-muted">
              Archivo privado cargado ·{" "}
              {formatFileSize(asset?.sizeBytes ?? null)}
            </p>
          ) : null}
        </section>
      ) : null}

      {type === "video" ? (
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <label
            className="grid gap-2 text-sm font-medium"
            htmlFor="content-duration"
          >
            Duración (segundos)
            <input
              id="content-duration"
              className="h-11 rounded-sm border bg-paper px-3 text-sm outline-none focus:border-jade"
              type="number"
              min="1"
              value={durationSeconds}
              onChange={(event) => setDurationSeconds(event.target.value)}
              required
            />
          </label>
          {location !== "course" ? (
            <label className="flex h-11 items-center gap-3 text-sm">
              <input
                className="size-4 accent-jade"
                type="checkbox"
                checked={isPrimary}
                onChange={(event) => setIsPrimary(event.target.checked)}
              />
              Video principal del módulo
            </label>
          ) : null}
          <section className="border border-dashed border-line bg-surface p-4 sm:col-span-2">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Portada del video</p>
                <p className="mt-1 text-xs leading-5 text-muted">
                  JPEG, PNG, WebP o GIF. Se muestra antes de reproducir.
                </p>
              </div>
              {videoPosterStoragePath ? (
                <button
                  className="h-8 rounded-sm border bg-paper px-3 text-xs hover:bg-surface"
                  type="button"
                  onClick={() => setVideoPosterStoragePath(null)}
                >
                  Quitar portada
                </button>
              ) : null}
            </div>
            <label className="mt-4 inline-flex h-10 cursor-pointer items-center gap-2 rounded-sm border bg-paper px-3 text-sm font-medium transition-colors hover:bg-surface">
              <Upload className="size-4" aria-hidden="true" />
              Seleccionar imagen
              <input
                className="sr-only"
                type="file"
                accept={courseCoverFileAccept}
                onChange={handlePosterFileChange}
              />
            </label>
            {pendingPosterFile ? (
              <p className="mt-3 text-xs text-muted">
                {pendingPosterFile.file.name} ·{" "}
                {formatFileSize(pendingPosterFile.file.size)}
              </p>
            ) : videoPosterStoragePath ? (
              <p className="mt-3 text-xs text-muted">Portada cargada</p>
            ) : null}
          </section>
        </div>
      ) : null}

      {error ? (
        <p
          className="rounded-sm bg-[#FCEAE6] px-3 py-2 text-sm text-alert"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <div className="flex justify-end gap-3 border-t border-line pt-5">
        <button
          className="h-11 rounded-sm border px-4 text-sm"
          type="button"
          onClick={onClose}
          disabled={saving}
        >
          Cancelar
        </button>
        <button
          className="h-11 rounded-sm bg-jade px-4 text-sm font-medium text-white transition-colors hover:bg-jade-deep disabled:opacity-60"
          type="submit"
          disabled={saving}
        >
          {saving
            ? "Guardando"
            : asset
              ? "Guardar contenido"
              : "Agregar contenido"}
        </button>
      </div>
    </form>
  );
}

function AssetRow({
  asset,
  onEdit,
  onRemove,
}: {
  asset: CourseContentAsset;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const Icon = assetIcon(asset.type);
  return (
    <article className="flex flex-wrap items-center justify-between gap-4 px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center bg-surface text-jade-deep">
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{asset.title}</p>
          <p className="mt-1 text-xs text-muted">
            {asset.isPrimary ? "Video principal · " : ""}
            {assetLabel(asset.type)}
            {asset.type === "video"
              ? ` · ${Math.max(1, Math.ceil(asset.durationSeconds / 60))} min`
              : ""}
            {asset.storagePath
              ? ` · ${formatFileSize(asset.sizeBytes)}`
              : " · Enlace externo"}
          </p>
        </div>
      </div>
      <div className="flex gap-1">
        <button
          className="grid size-9 place-items-center rounded-sm border transition-colors hover:bg-surface"
          type="button"
          onClick={onEdit}
          aria-label={`Editar ${asset.title}`}
          title="Editar contenido"
        >
          <Pencil className="size-4" aria-hidden="true" />
        </button>
        <button
          className="grid size-9 place-items-center rounded-sm border text-alert transition-colors hover:bg-[#FCEAE6]"
          type="button"
          onClick={onRemove}
          aria-label={`Eliminar ${asset.title}`}
          title="Eliminar contenido"
        >
          <Trash2 className="size-4" aria-hidden="true" />
        </button>
      </div>
    </article>
  );
}

export function CourseContentStudio({
  course,
  courseAssets,
  modules,
}: {
  course: { id: string; title: string; slug: string };
  courseAssets: CourseContentAsset[];
  modules: CourseContentModule[];
}) {
  const router = useRouter();
  const [editor, setEditor] = useState<{
    asset?: CourseContentAsset;
    target: string;
  } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function remove(asset: CourseContentAsset) {
    if (!window.confirm(`¿Eliminar “${asset.title}”?`)) return;
    setNotice(null);
    startTransition(async () => {
      const response = await deleteAsset(asset.id);
      if ("error" in response && response.error) setNotice(response.error);
      else router.refresh();
    });
  }

  function section(
    assetList: CourseContentAsset[],
    target: string,
    title: string,
    description: string,
  ) {
    return (
      <section className="border border-line bg-paper" key={target}>
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            <h2 className="font-medium">{title}</h2>
            <p className="mt-1 text-sm text-muted">{description}</p>
          </div>
          <button
            className="inline-flex h-10 items-center gap-2 rounded-sm border px-3 text-sm font-medium transition-colors hover:bg-surface"
            type="button"
            onClick={() => setEditor({ target })}
          >
            <Plus className="size-4" aria-hidden="true" />
            Agregar contenido
          </button>
        </header>
        {assetList.length ? (
          <div className="divide-y divide-line">
            {assetList.map((asset) => (
              <AssetRow
                asset={asset}
                key={asset.id}
                onEdit={() => setEditor({ asset, target })}
                onRemove={() => remove(asset)}
              />
            ))}
          </div>
        ) : (
          <p className="px-5 py-6 text-sm text-muted">
            Todavía no hay contenidos cargados.
          </p>
        )}
      </section>
    );
  }

  return (
    <div>
      <header className="border-b border-line pb-6">
        <Link
          href={`/admin/cursos/${course.id}`}
          className="inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-ink"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          Volver al curso
        </Link>
        <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm text-muted">Biblioteca de contenido</p>
            <h1 className="mt-2 text-[31px] font-medium leading-tight">
              {course.title}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
              Cargá videos, documentos y recursos de apoyo. Los archivos quedan
              privados y se entregan con acceso firmado.
            </p>
          </div>
          <button
            className="inline-flex h-10 items-center gap-2 rounded-sm bg-jade px-4 text-sm font-medium text-white transition-colors hover:bg-jade-deep"
            type="button"
            onClick={() => setEditor({ target: "course" })}
          >
            <Plus className="size-4" aria-hidden="true" />
            Agregar recurso
          </button>
        </div>
      </header>

      {notice ? (
        <p
          className="mt-5 rounded-sm bg-[#FCEAE6] px-3 py-2 text-sm text-alert"
          role="alert"
        >
          {notice}
        </p>
      ) : null}

      <div className="mt-6 space-y-5">
        {section(
          courseAssets,
          "course",
          "Recursos generales del curso",
          "Disponibles para todas las personas asignadas al curso.",
        )}
        {modules.map((module, index) =>
          section(
            module.assets,
            module.id,
            `Módulo ${String(index + 1).padStart(2, "0")}: ${module.title}`,
            "Se muestran dentro de esta lección para las personas asignadas.",
          ),
        )}
        {!modules.length ? (
          <section className="border border-dashed border-line bg-surface p-6">
            <Video className="size-5 text-jade" aria-hidden="true" />
            <p className="mt-4 text-sm text-muted">
              Podés cargar recursos generales ahora o crear módulos para
              organizar lecciones y videos.
            </p>
          </section>
        ) : null}
      </div>

      {editor ? (
        <Dialog
          title={editor.asset ? "Editar contenido" : "Agregar contenido"}
          onClose={() => setEditor(null)}
        >
          <AssetEditor
            course={course}
            modules={modules}
            courseAssets={courseAssets}
            asset={editor.asset}
            target={editor.target}
            onClose={() => setEditor(null)}
          />
        </Dialog>
      ) : null}
    </div>
  );
}
