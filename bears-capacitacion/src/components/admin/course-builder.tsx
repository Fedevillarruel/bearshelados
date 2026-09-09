"use client";

import {
  startTransition,
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  ChevronLeft,
  FilePlus2,
  FileText,
  GripVertical,
  ImageIcon,
  Link2,
  Pencil,
  Plus,
  Trash2,
  Upload,
  Users,
  Video,
  X,
} from "lucide-react";
import {
  assignCourse,
  createCourseAssetUploadUrl,
  createCourseVideoPosterUploadUrl,
  deleteAsset,
  deleteExam,
  deleteModule,
  reorderModules,
  saveAsset,
  saveExam,
  saveModule,
  unassignCourse,
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

export type BuilderAsset = {
  id: string;
  type: AssetType;
  isPrimary: boolean;
  title: string;
  description: string | null;
  url: string;
  storagePath: string | null;
  videoPosterStoragePath: string | null;
  durationSeconds: number;
  orderIndex: number;
};

type BuilderQuestion = {
  prompt: string;
  explanation: string | null;
  points: number;
  options: Array<{ label: string; isCorrect: boolean }>;
};

export type BuilderExam = {
  id: string;
  title: string;
  description: string | null;
  courseId: string | null;
  moduleId: string | null;
  passingScore: number;
  maxAttempts: number | null;
  cooldownMinutes: number;
  timeLimitMinutes: number | null;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  showCorrectAnswers: boolean;
  blocksProgress: boolean;
  isActive: boolean;
  questions: BuilderQuestion[];
};

export type BuilderModule = {
  id: string;
  title: string;
  description: string | null;
  orderIndex: number;
  isPublished: boolean;
  assets: BuilderAsset[];
  exams: BuilderExam[];
};

type Employee = {
  id: string;
  fullName: string | null;
  email: string;
  franchiseName: string | null;
};
type Enrollment = {
  userId: string;
  dueDate: string | null;
  status: string;
  progressPercent: number;
};

export type BuilderCourse = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  isPublished: boolean;
};

function optional(value: string) {
  const trimmed = value.trim();
  return trimmed || null;
}

function assetIcon(type: AssetType) {
  if (type === "video") return Video;
  if (type === "pdf") return FileText;
  if (type === "image") return ImageIcon;
  if (type === "link") return Link2;
  return FilePlus2;
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
        aria-labelledby="editor-dialog-title"
      >
        <div className="mb-6 flex items-start justify-between gap-4">
          <h2 className="text-xl font-medium" id="editor-dialog-title">
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

type ModuleContentDraft = {
  id: string;
  type: AssetType;
  title: string;
  description: string;
  source: string;
  durationSeconds: string;
  file: PendingCourseAssetFile | null;
  videoPosterFile: PendingCourseAssetFile | null;
  isPrimary: boolean;
};

function newModuleContentDraft(): ModuleContentDraft {
  return {
    id: crypto.randomUUID(),
    type: "video",
    title: "",
    description: "",
    source: "",
    durationSeconds: "",
    file: null,
    videoPosterFile: null,
    isPrimary: false,
  };
}

async function uploadCourseAssetFile(
  courseId: string,
  pendingFile: PendingCourseAssetFile,
) {
  const signedUpload = await createCourseAssetUploadUrl({
    courseId,
    fileName: pendingFile.file.name,
    contentType: pendingFile.contentType,
    fileSize: pendingFile.file.size,
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
      file: pendingFile.file,
      contentType: pendingFile.contentType,
    });
    return { data: signedUpload.data.path };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "No pudimos subir el archivo.",
    };
  }
}

async function uploadCourseVideoPosterFile(
  courseId: string,
  pendingFile: PendingCourseAssetFile,
) {
  const signedUpload = await createCourseVideoPosterUploadUrl({
    courseId,
    fileName: pendingFile.file.name,
    contentType: pendingFile.contentType,
    fileSize: pendingFile.file.size,
  });
  if ("error" in signedUpload && signedUpload.error)
    return { error: signedUpload.error };
  if (!("data" in signedUpload) || !signedUpload.data)
    return { error: "No pudimos preparar la subida de la portada del video." };
  try {
    await uploadPrivateFile({
      bucket: "course-media",
      path: signedUpload.data.path,
      token: signedUpload.data.token,
      file: pendingFile.file,
      contentType: pendingFile.contentType,
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

function ModuleForm({
  courseId,
  courseModule,
  nextOrderIndex,
  onClose,
}: {
  courseId: string;
  courseModule?: BuilderModule;
  nextOrderIndex: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(courseModule?.title ?? "");
  const [description, setDescription] = useState(
    courseModule?.description ?? "",
  );
  const [isPublished, setIsPublished] = useState(
    courseModule?.isPublished ?? true,
  );
  const [drafts, setDrafts] = useState<ModuleContentDraft[]>([]);
  const [savedModuleId, setSavedModuleId] = useState<string | null>(
    courseModule?.id ?? null,
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function updateDraft(draftId: string, changes: Partial<ModuleContentDraft>) {
    setDrafts((current) =>
      current.map((draft) =>
        draft.id === draftId ? { ...draft, ...changes } : draft,
      ),
    );
  }

  function makePrimary(draftId: string, isPrimary: boolean) {
    setDrafts((current) =>
      current.map((draft) => ({
        ...draft,
        isPrimary: draft.id === draftId ? isPrimary : false,
      })),
    );
  }

  function loadVideoDuration(draftId: string, file: File) {
    const preview = document.createElement("video");
    const objectUrl = URL.createObjectURL(file);
    preview.preload = "metadata";
    preview.onloadedmetadata = () => {
      if (Number.isFinite(preview.duration) && preview.duration > 0)
        updateDraft(draftId, {
          durationSeconds: String(Math.ceil(preview.duration)),
        });
      URL.revokeObjectURL(objectUrl);
    };
    preview.onerror = () => URL.revokeObjectURL(objectUrl);
    preview.src = objectUrl;
  }

  function handleDraftFile(
    draftId: string,
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;
    const detected = detectCourseAssetFile(selectedFile);
    if (!detected) {
      setError(
        "Formato no admitido. Usá MP4, WebM, PDF, imagen, Excel, CSV, Word o PowerPoint.",
      );
      return;
    }
    setError(null);
    setDrafts((current) =>
      current.map((draft) =>
        draft.id === draftId
          ? {
              ...draft,
              type: detected.type,
              file: detected,
              title:
                draft.title.trim() || selectedFile.name.replace(/\.[^.]+$/, ""),
              videoPosterFile:
                detected.type === "video" ? draft.videoPosterFile : null,
              isPrimary: detected.type === "video" ? draft.isPrimary : false,
            }
          : draft,
      ),
    );
    if (detected.type === "video") loadVideoDuration(draftId, selectedFile);
  }

  function handleDraftPosterFile(
    draftId: string,
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;
    const detected = detectCourseCoverFile(selectedFile);
    if (!detected) {
      setError(
        "La portada del video debe ser una imagen JPEG, PNG, WebP o GIF.",
      );
      return;
    }
    setError(null);
    updateDraft(draftId, { videoPosterFile: detected });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    startTransition(async () => {
      const response = await saveModule({
        id: savedModuleId,
        courseId,
        title,
        description: optional(description),
        orderIndex: courseModule?.orderIndex ?? nextOrderIndex,
        isPublished,
      });
      if ("error" in response && response.error) {
        setSaving(false);
        setError(response.error);
        return;
      }
      if (!("data" in response) || !response.data) {
        setSaving(false);
        setError("No pudimos guardar el módulo.");
        return;
      }
      const moduleId = response.data.id;
      setSavedModuleId(moduleId);
      const baseOrderIndex = Math.max(
        0,
        ...(courseModule?.assets.map((asset) => asset.orderIndex) ?? []),
      );
      const normalizedDrafts = drafts.map((draft) =>
        drafts.length === 1 && draft.type === "video"
          ? {
              ...draft,
              title: draft.title.trim() || title,
              description: draft.description.trim() || description,
              isPrimary: true,
            }
          : draft,
      );
      for (const [index, draft] of normalizedDrafts.entries()) {
        let storagePath: string | null = null;
        let videoPosterStoragePath: string | null = null;
        if (draft.file) {
          const upload = await uploadCourseAssetFile(courseId, draft.file);
          if ("error" in upload && upload.error) {
            setSaving(false);
            setError(
              `El módulo se guardó, pero no pudimos cargar “${draft.title}”: ${upload.error}`,
            );
            router.refresh();
            return;
          }
          storagePath = "data" in upload ? (upload.data ?? null) : null;
        }
        if (draft.type === "video" && draft.videoPosterFile) {
          const upload = await uploadCourseVideoPosterFile(
            courseId,
            draft.videoPosterFile,
          );
          if ("error" in upload && upload.error) {
            setSaving(false);
            setError(
              `El módulo se guardó, pero no pudimos cargar la portada de “${draft.title}”: ${upload.error}`,
            );
            router.refresh();
            return;
          }
          videoPosterStoragePath =
            "data" in upload ? (upload.data ?? null) : null;
        }
        const savedAsset = await saveAsset({
          courseId: null,
          moduleId,
          type: draft.type,
          isPrimary: draft.type === "video" && draft.isPrimary,
          title: draft.title,
          description: optional(draft.description),
          url:
            draft.type === "text"
              ? draft.source
              : storagePath
                ? ""
                : draft.source,
          storagePath,
          videoPosterStoragePath,
          durationSeconds: Number(draft.durationSeconds),
          sizeBytes: draft.file?.file.size ?? null,
          orderIndex: baseOrderIndex + index + 1,
        });
        if ("error" in savedAsset && savedAsset.error) {
          setSaving(false);
          setError(
            `El módulo se guardó, pero no pudimos cargar “${draft.title}”: ${savedAsset.error}`,
          );
          router.refresh();
          return;
        }
        setDrafts((current) =>
          current.filter((candidate) => candidate.id !== draft.id),
        );
      }
      setSaving(false);
      router.refresh();
      onClose();
    });
  }

  return (
    <form className="grid gap-5" onSubmit={submit}>
      <label className="grid gap-2 text-sm font-medium" htmlFor="module-title">
        Título
        <input
          id="module-title"
          className="h-11 rounded-sm border bg-paper px-3 text-sm outline-none focus:border-jade"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          required
        />
      </label>
      <label
        className="grid gap-2 text-sm font-medium"
        htmlFor="module-description"
      >
        Descripción
        <textarea
          id="module-description"
          className="min-h-28 resize-y rounded-sm border bg-paper px-3 py-2 text-sm outline-none focus:border-jade"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </label>
      {!courseModule ? (
        <section className="border border-line bg-surface p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Contenido inicial</p>
              <p className="mt-1 text-xs leading-5 text-muted">
                Opcional. Podés sumar videos, archivos, texto o enlaces al crear
                la lección.
              </p>
            </div>
            <button
              className="inline-flex h-9 items-center gap-2 rounded-sm border bg-paper px-3 text-sm font-medium hover:bg-surface"
              type="button"
              onClick={() =>
                setDrafts((current) => [...current, newModuleContentDraft()])
              }
            >
              <Plus className="size-4" aria-hidden="true" />
              Agregar contenido
            </button>
          </div>
          {drafts.length ? (
            <div className="mt-4 grid gap-4">
              {drafts.map((draft, index) => (
                <article
                  className="border border-line bg-paper p-4"
                  key={draft.id}
                >
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <p className="text-sm font-medium">Contenido {index + 1}</p>
                    <button
                      className="grid size-8 place-items-center rounded-sm text-alert hover:bg-[#FCEAE6]"
                      type="button"
                      aria-label={`Quitar contenido ${index + 1}`}
                      title="Quitar contenido"
                      onClick={() =>
                        setDrafts((current) =>
                          current.filter(
                            (candidate) => candidate.id !== draft.id,
                          ),
                        )
                      }
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </button>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label
                      className="grid gap-2 text-sm font-medium"
                      htmlFor={`draft-type-${draft.id}`}
                    >
                      Tipo
                      <select
                        id={`draft-type-${draft.id}`}
                        className="h-11 rounded-sm border bg-paper px-3 text-sm"
                        value={draft.type}
                        onChange={(event) =>
                          updateDraft(draft.id, {
                            type: event.target.value as AssetType,
                            file: null,
                            videoPosterFile:
                              event.target.value === "video"
                                ? draft.videoPosterFile
                                : null,
                            isPrimary:
                              event.target.value === "video"
                                ? draft.isPrimary
                                : false,
                          })
                        }
                      >
                        <option value="video">Video</option>
                        <option value="pdf">PDF</option>
                        <option value="image">Imagen</option>
                        <option value="spreadsheet">
                          Planilla Excel o CSV
                        </option>
                        <option value="document">Documento</option>
                        <option value="text">Texto</option>
                        <option value="link">Enlace</option>
                      </select>
                    </label>
                    <label
                      className="grid gap-2 text-sm font-medium"
                      htmlFor={`draft-title-${draft.id}`}
                    >
                      Título
                      <input
                        id={`draft-title-${draft.id}`}
                        className="h-11 rounded-sm border bg-paper px-3 text-sm outline-none focus:border-jade"
                        value={draft.title}
                        onChange={(event) =>
                          updateDraft(draft.id, { title: event.target.value })
                        }
                        required
                      />
                    </label>
                  </div>
                  <label
                    className="mt-4 grid gap-2 text-sm font-medium"
                    htmlFor={`draft-description-${draft.id}`}
                  >
                    Descripción
                    <input
                      id={`draft-description-${draft.id}`}
                      className="h-11 rounded-sm border bg-paper px-3 text-sm outline-none focus:border-jade"
                      value={draft.description}
                      onChange={(event) =>
                        updateDraft(draft.id, {
                          description: event.target.value,
                        })
                      }
                    />
                  </label>
                  {draft.type === "text" ? (
                    <label
                      className="mt-4 grid gap-2 text-sm font-medium"
                      htmlFor={`draft-source-${draft.id}`}
                    >
                      Contenido
                      <textarea
                        id={`draft-source-${draft.id}`}
                        className="min-h-32 resize-y rounded-sm border bg-paper px-3 py-2 text-sm outline-none focus:border-jade"
                        value={draft.source}
                        onChange={(event) =>
                          updateDraft(draft.id, { source: event.target.value })
                        }
                        required
                      />
                    </label>
                  ) : (
                    <label
                      className="mt-4 grid gap-2 text-sm font-medium"
                      htmlFor={`draft-source-${draft.id}`}
                    >
                      {draft.type === "video"
                        ? "URL de YouTube o video externo"
                        : "URL externa (opcional si subís un archivo)"}
                      <input
                        id={`draft-source-${draft.id}`}
                        className="h-11 rounded-sm border bg-paper px-3 text-sm outline-none focus:border-jade"
                        type="url"
                        placeholder={
                          draft.type === "video"
                            ? "https://www.youtube.com/watch?v=..."
                            : "https://"
                        }
                        value={draft.source}
                        onChange={(event) =>
                          updateDraft(draft.id, { source: event.target.value })
                        }
                        required={!draft.file}
                      />
                    </label>
                  )}
                  {draft.type !== "text" && draft.type !== "link" ? (
                    <label className="mt-4 inline-flex h-10 cursor-pointer items-center gap-2 rounded-sm border px-3 text-sm font-medium hover:bg-surface">
                      <Upload className="size-4" aria-hidden="true" />
                      Seleccionar archivo
                      <input
                        className="sr-only"
                        type="file"
                        accept={courseAssetFileAccept}
                        onChange={(event) => handleDraftFile(draft.id, event)}
                      />
                    </label>
                  ) : null}
                  {draft.file ? (
                    <p className="mt-2 text-xs text-muted">
                      {draft.file.file.name}
                    </p>
                  ) : null}
                  {draft.type === "video" ? (
                    <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                      <label
                        className="grid gap-2 text-sm font-medium"
                        htmlFor={`draft-duration-${draft.id}`}
                      >
                        Duración (segundos)
                        <input
                          id={`draft-duration-${draft.id}`}
                          className="h-11 rounded-sm border bg-paper px-3 text-sm outline-none focus:border-jade"
                          type="number"
                          min="1"
                          value={draft.durationSeconds}
                          onChange={(event) =>
                            updateDraft(draft.id, {
                              durationSeconds: event.target.value,
                            })
                          }
                          required
                        />
                      </label>
                      <label className="flex h-11 items-center gap-3 text-sm">
                        <input
                          className="size-4 accent-jade"
                          type="checkbox"
                          checked={draft.isPrimary}
                          onChange={(event) =>
                            makePrimary(draft.id, event.target.checked)
                          }
                        />
                        Video principal
                      </label>
                      <section className="border border-dashed border-line bg-surface p-3 sm:col-span-2">
                        <p className="text-sm font-medium">Portada del video</p>
                        <label className="mt-3 inline-flex h-9 cursor-pointer items-center gap-2 rounded-sm border bg-paper px-3 text-sm font-medium hover:bg-surface">
                          <Upload className="size-4" aria-hidden="true" />
                          Elegir imagen
                          <input
                            className="sr-only"
                            type="file"
                            accept={courseCoverFileAccept}
                            onChange={(event) =>
                              handleDraftPosterFile(draft.id, event)
                            }
                          />
                        </label>
                        {draft.videoPosterFile ? (
                          <p className="mt-2 text-xs text-muted">
                            {draft.videoPosterFile.file.name}
                          </p>
                        ) : null}
                      </section>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}
      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input
          className="size-4 accent-jade"
          type="checkbox"
          checked={isPublished}
          onChange={(event) => setIsPublished(event.target.checked)}
        />
        Publicado para participantes
      </label>
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
          className="h-11 rounded-sm bg-jade px-4 text-sm font-medium text-white disabled:opacity-60"
          type="submit"
          disabled={saving}
        >
          {saving
            ? "Guardando"
            : savedModuleId
              ? "Guardar cambios"
              : "Crear módulo"}
        </button>
      </div>
    </form>
  );
}

function AssetForm({
  course,
  courseModule,
  asset,
  onClose,
}: {
  course: BuilderCourse;
  courseModule: BuilderModule;
  asset?: BuilderAsset;
  onClose: () => void;
}) {
  const router = useRouter();
  const [type, setType] = useState<AssetType>(asset?.type ?? "text");
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
  const [file, setFile] = useState<File | null>(null);
  const [videoPosterFile, setVideoPosterFile] =
    useState<PendingCourseAssetFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const acceptsFiles = type === "video" || type === "pdf" || type === "image";
  const accept =
    type === "video"
      ? "video/mp4,video/webm"
      : type === "pdf"
        ? "application/pdf"
        : "image/jpeg,image/png,image/webp";

  async function uploadSelectedFile(selectedFile: File) {
    if (
      (type === "video" && !selectedFile.type.startsWith("video/")) ||
      (type === "pdf" && selectedFile.type !== "application/pdf") ||
      (type === "image" && !selectedFile.type.startsWith("image/"))
    ) {
      return {
        error: "El archivo no coincide con el tipo de contenido elegido.",
      };
    }
    const signedUpload = await createCourseAssetUploadUrl({
      courseId: course.id,
      fileName: selectedFile.name,
      contentType: selectedFile.type,
      fileSize: selectedFile.size,
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
        file: selectedFile,
        contentType: selectedFile.type,
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

  function handleVideoPosterFile(event: ChangeEvent<HTMLInputElement>) {
    const selectedFile = event.target.files?.[0] ?? null;
    if (!selectedFile) return;
    const detected = detectCourseCoverFile(selectedFile);
    if (!detected) {
      setVideoPosterFile(null);
      setError(
        "La portada del video debe ser una imagen JPEG, PNG, WebP o GIF.",
      );
      return;
    }
    setError(null);
    setVideoPosterFile(detected);
    setVideoPosterStoragePath(null);
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    startTransition(async () => {
      let nextStoragePath = storagePath;
      let nextVideoPosterStoragePath =
        type === "video" ? videoPosterStoragePath : null;
      if (file) {
        const upload = await uploadSelectedFile(file);
        if ("error" in upload && upload.error) {
          setError(upload.error);
          setSaving(false);
          return;
        }
        nextStoragePath = "data" in upload ? (upload.data ?? null) : null;
      }
      if (type === "video" && videoPosterFile) {
        const upload = await uploadCourseVideoPosterFile(
          course.id,
          videoPosterFile,
        );
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
        courseId: null,
        moduleId: courseModule.id,
        type,
        title,
        description: optional(description),
        url: type === "text" ? source : nextStoragePath ? "" : source,
        storagePath: nextStoragePath,
        videoPosterStoragePath: nextVideoPosterStoragePath,
        durationSeconds: Number(durationSeconds),
        orderIndex:
          asset?.orderIndex ??
          Math.max(0, ...courseModule.assets.map((item) => item.orderIndex)) +
            1,
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
    <form className="grid gap-4" onSubmit={submit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2 text-sm font-medium" htmlFor="asset-type">
          Tipo
          <select
            id="asset-type"
            className="h-11 rounded-sm border bg-paper px-3 text-sm"
            value={type}
            onChange={(event) => {
              setType(event.target.value as AssetType);
              setStoragePath(null);
              setFile(null);
              if (event.target.value !== "video") {
                setVideoPosterFile(null);
                setVideoPosterStoragePath(null);
              }
            }}
          >
            <option value="text">Texto</option>
            <option value="link">Enlace</option>
            <option value="video">Video</option>
            <option value="pdf">PDF</option>
            <option value="image">Imagen</option>
          </select>
        </label>
        <label className="grid gap-2 text-sm font-medium" htmlFor="asset-title">
          Título
          <input
            id="asset-title"
            className="h-11 rounded-sm border bg-paper px-3 text-sm outline-none focus:border-jade"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
          />
        </label>
      </div>
      <label
        className="grid gap-2 text-sm font-medium"
        htmlFor="asset-description"
      >
        Descripción
        <input
          id="asset-description"
          className="h-11 rounded-sm border bg-paper px-3 text-sm outline-none focus:border-jade"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </label>
      {type === "text" ? (
        <label
          className="grid gap-2 text-sm font-medium"
          htmlFor="asset-content"
        >
          Contenido
          <textarea
            id="asset-content"
            className="min-h-36 resize-y rounded-sm border bg-paper px-3 py-2 text-sm outline-none focus:border-jade"
            value={source}
            onChange={(event) => setSource(event.target.value)}
            required
          />
        </label>
      ) : (
        <label className="grid gap-2 text-sm font-medium" htmlFor="asset-url">
          URL externa (opcional si subís un archivo)
          <input
            id="asset-url"
            className="h-11 rounded-sm border bg-paper px-3 text-sm outline-none focus:border-jade"
            type="url"
            placeholder="https://"
            value={source}
            onChange={(event) => {
              setSource(event.target.value);
              if (event.target.value) setStoragePath(null);
            }}
            required={!storagePath && !file}
          />
        </label>
      )}
      {acceptsFiles ? (
        <div className="border border-dashed border-line p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Archivo privado</p>
              <p className="mt-1 text-xs text-muted">
                {storagePath
                  ? "Ya hay un archivo cargado. Elegí otro para reemplazarlo."
                  : "Se guarda en Storage y sólo se entrega con una URL firmada."}
              </p>
            </div>
            {storagePath ? (
              <button
                className="h-8 rounded-sm border px-3 text-xs"
                type="button"
                onClick={() => setStoragePath(null)}
              >
                Quitar archivo
              </button>
            ) : null}
          </div>
          <label className="mt-4 inline-flex h-10 cursor-pointer items-center gap-2 rounded-sm border px-3 text-sm font-medium hover:bg-surface">
            <Upload className="size-4" aria-hidden="true" />
            Elegir archivo
            <input
              className="sr-only"
              type="file"
              accept={accept}
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </label>
          {file ? (
            <p className="mt-2 text-xs text-muted">
              {file.name} · {Math.round(file.size / 1024)} KB
            </p>
          ) : null}
        </div>
      ) : null}
      {type === "video" ? (
        <div className="grid gap-4">
          <label
            className="grid gap-2 text-sm font-medium"
            htmlFor="asset-duration"
          >
            Duración (segundos)
            <input
              id="asset-duration"
              className="h-11 rounded-sm border bg-paper px-3 text-sm outline-none focus:border-jade"
              type="number"
              min="1"
              value={durationSeconds}
              onChange={(event) => setDurationSeconds(event.target.value)}
              required
            />
          </label>
          <section className="border border-dashed border-line p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Portada del video</p>
                <p className="mt-1 text-xs text-muted">
                  Se muestra antes de reproducir.
                </p>
              </div>
              {videoPosterStoragePath ? (
                <button
                  className="h-8 rounded-sm border px-3 text-xs"
                  type="button"
                  onClick={() => setVideoPosterStoragePath(null)}
                >
                  Quitar portada
                </button>
              ) : null}
            </div>
            <label className="mt-4 inline-flex h-10 cursor-pointer items-center gap-2 rounded-sm border px-3 text-sm font-medium hover:bg-surface">
              <Upload className="size-4" aria-hidden="true" />
              Elegir imagen
              <input
                className="sr-only"
                type="file"
                accept={courseCoverFileAccept}
                onChange={handleVideoPosterFile}
              />
            </label>
            {videoPosterFile ? (
              <p className="mt-2 text-xs text-muted">
                {videoPosterFile.file.name}
              </p>
            ) : videoPosterStoragePath ? (
              <p className="mt-2 text-xs text-muted">Portada cargada</p>
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
      <div className="mt-2 flex justify-end gap-3">
        <button
          className="h-11 rounded-sm border px-4 text-sm"
          type="button"
          onClick={onClose}
          disabled={saving}
        >
          Cancelar
        </button>
        <button
          className="h-11 rounded-sm bg-jade px-4 text-sm font-medium text-white disabled:opacity-60"
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

function defaultQuestion(): BuilderQuestion {
  return {
    prompt: "",
    explanation: null,
    points: 1,
    options: [
      { label: "", isCorrect: true },
      { label: "", isCorrect: false },
    ],
  };
}

function ExamForm({
  course,
  courseModule,
  exam,
  onClose,
}: {
  course: BuilderCourse;
  courseModule?: BuilderModule;
  exam?: BuilderExam;
  onClose: () => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(exam?.title ?? "");
  const [description, setDescription] = useState(exam?.description ?? "");
  const [passingScore, setPassingScore] = useState(
    String(exam?.passingScore ?? 70),
  );
  const [maxAttempts, setMaxAttempts] = useState(
    exam?.maxAttempts?.toString() ?? "",
  );
  const [cooldownMinutes, setCooldownMinutes] = useState(
    String(exam?.cooldownMinutes ?? 0),
  );
  const [timeLimitMinutes, setTimeLimitMinutes] = useState(
    exam?.timeLimitMinutes?.toString() ?? "",
  );
  const [shuffleQuestions, setShuffleQuestions] = useState(
    exam?.shuffleQuestions ?? true,
  );
  const [shuffleOptions, setShuffleOptions] = useState(
    exam?.shuffleOptions ?? true,
  );
  const [showCorrectAnswers, setShowCorrectAnswers] = useState(
    exam?.showCorrectAnswers ?? false,
  );
  const [blocksProgress, setBlocksProgress] = useState(
    exam?.blocksProgress ?? true,
  );
  const [isActive, setIsActive] = useState(exam?.isActive ?? true);
  const [questions, setQuestions] = useState<BuilderQuestion[]>(
    exam?.questions.length ? exam.questions : [defaultQuestion()],
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function updateQuestion(
    questionIndex: number,
    changes: Partial<BuilderQuestion>,
  ) {
    setQuestions((current) =>
      current.map((question, index) =>
        index === questionIndex ? { ...question, ...changes } : question,
      ),
    );
  }

  function updateOption(
    questionIndex: number,
    optionIndex: number,
    changes: Partial<BuilderQuestion["options"][number]>,
  ) {
    setQuestions((current) =>
      current.map((question, index) =>
        index === questionIndex
          ? {
              ...question,
              options: question.options.map((option, candidateIndex) =>
                candidateIndex === optionIndex
                  ? { ...option, ...changes }
                  : option,
              ),
            }
          : question,
      ),
    );
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    startTransition(async () => {
      const response = await saveExam({
        id: exam?.id,
        courseId: courseModule ? null : course.id,
        moduleId: courseModule?.id ?? null,
        title,
        description: optional(description),
        passingScore: Number(passingScore),
        maxAttempts: maxAttempts ? Number(maxAttempts) : null,
        cooldownMinutes: Number(cooldownMinutes),
        timeLimitMinutes: timeLimitMinutes ? Number(timeLimitMinutes) : null,
        shuffleQuestions,
        shuffleOptions,
        showCorrectAnswers,
        blocksProgress,
        isActive,
        questions: questions.map((question) => ({
          ...question,
          explanation: question.explanation?.trim() || null,
        })),
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
        <label className="grid gap-2 text-sm font-medium" htmlFor="exam-title">
          Título
          <input
            id="exam-title"
            className="h-11 rounded-sm border bg-paper px-3 text-sm outline-none focus:border-jade"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
          />
        </label>
        <label className="grid gap-2 text-sm font-medium" htmlFor="exam-score">
          Nota mínima (%)
          <input
            id="exam-score"
            className="h-11 rounded-sm border bg-paper px-3 text-sm outline-none focus:border-jade"
            type="number"
            min="0"
            max="100"
            value={passingScore}
            onChange={(event) => setPassingScore(event.target.value)}
            required
          />
        </label>
      </div>
      <label
        className="grid gap-2 text-sm font-medium"
        htmlFor="exam-description"
      >
        Descripción
        <input
          id="exam-description"
          className="h-11 rounded-sm border bg-paper px-3 text-sm outline-none focus:border-jade"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </label>
      <div className="grid gap-4 sm:grid-cols-3">
        <label
          className="grid gap-2 text-sm font-medium"
          htmlFor="exam-attempts"
        >
          Intentos (vacío = sin límite)
          <input
            id="exam-attempts"
            className="h-11 rounded-sm border bg-paper px-3 text-sm outline-none focus:border-jade"
            type="number"
            min="1"
            value={maxAttempts}
            onChange={(event) => setMaxAttempts(event.target.value)}
          />
        </label>
        <label
          className="grid gap-2 text-sm font-medium"
          htmlFor="exam-cooldown"
        >
          Espera (min)
          <input
            id="exam-cooldown"
            className="h-11 rounded-sm border bg-paper px-3 text-sm outline-none focus:border-jade"
            type="number"
            min="0"
            value={cooldownMinutes}
            onChange={(event) => setCooldownMinutes(event.target.value)}
            required
          />
        </label>
        <label className="grid gap-2 text-sm font-medium" htmlFor="exam-time">
          Tiempo (min, opcional)
          <input
            id="exam-time"
            className="h-11 rounded-sm border bg-paper px-3 text-sm outline-none focus:border-jade"
            type="number"
            min="1"
            value={timeLimitMinutes}
            onChange={(event) => setTimeLimitMinutes(event.target.value)}
          />
        </label>
      </div>
      <div className="grid gap-2 text-sm sm:grid-cols-2">
        <label className="flex min-h-10 items-center gap-3">
          <input
            className="size-4 accent-jade"
            type="checkbox"
            checked={shuffleQuestions}
            onChange={(event) => setShuffleQuestions(event.target.checked)}
          />
          Mezclar preguntas
        </label>
        <label className="flex min-h-10 items-center gap-3">
          <input
            className="size-4 accent-jade"
            type="checkbox"
            checked={shuffleOptions}
            onChange={(event) => setShuffleOptions(event.target.checked)}
          />
          Mezclar opciones
        </label>
        <label className="flex min-h-10 items-center gap-3">
          <input
            className="size-4 accent-jade"
            type="checkbox"
            checked={showCorrectAnswers}
            onChange={(event) => setShowCorrectAnswers(event.target.checked)}
          />
          Mostrar respuestas correctas
        </label>
        <label className="flex min-h-10 items-center gap-3">
          <input
            className="size-4 accent-jade"
            type="checkbox"
            checked={blocksProgress}
            onChange={(event) => setBlocksProgress(event.target.checked)}
          />
          Bloquea el progreso hasta aprobar
        </label>
        <label className="flex min-h-10 items-center gap-3">
          <input
            className="size-4 accent-jade"
            type="checkbox"
            checked={isActive}
            onChange={(event) => setIsActive(event.target.checked)}
          />
          Evaluación activa
        </label>
      </div>
      <section className="border-t border-line pt-5">
        <div className="flex items-center justify-between gap-4">
          <h3 className="font-medium">Preguntas</h3>
          <button
            className="inline-flex h-9 items-center gap-2 rounded-sm border px-3 text-sm font-medium hover:bg-surface"
            type="button"
            onClick={() =>
              setQuestions((current) => [...current, defaultQuestion()])
            }
          >
            <Plus className="size-4" aria-hidden="true" />
            Agregar pregunta
          </button>
        </div>
        <div className="mt-4 space-y-5">
          {questions.map((question, questionIndex) => (
            <article className="border border-line p-4" key={questionIndex}>
              <div className="flex items-center justify-between gap-4">
                <p className="font-tabular text-xs text-muted">
                  PREGUNTA {String(questionIndex + 1).padStart(2, "0")}
                </p>
                {questions.length > 1 ? (
                  <button
                    className="grid size-8 place-items-center text-alert hover:bg-[#FCEAE6]"
                    type="button"
                    aria-label="Quitar pregunta"
                    onClick={() =>
                      setQuestions((current) =>
                        current.filter((_, index) => index !== questionIndex),
                      )
                    }
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </button>
                ) : null}
              </div>
              <label
                className="mt-3 grid gap-2 text-sm font-medium"
                htmlFor={`question-${questionIndex}`}
              >
                Enunciado
                <textarea
                  id={`question-${questionIndex}`}
                  className="min-h-20 resize-y rounded-sm border bg-paper px-3 py-2 text-sm outline-none focus:border-jade"
                  value={question.prompt}
                  onChange={(event) =>
                    updateQuestion(questionIndex, {
                      prompt: event.target.value,
                    })
                  }
                  required
                />
              </label>
              <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_110px]">
                <label
                  className="grid gap-2 text-sm font-medium"
                  htmlFor={`explanation-${questionIndex}`}
                >
                  Explicación (opcional)
                  <input
                    id={`explanation-${questionIndex}`}
                    className="h-10 rounded-sm border bg-paper px-3 text-sm outline-none focus:border-jade"
                    value={question.explanation ?? ""}
                    onChange={(event) =>
                      updateQuestion(questionIndex, {
                        explanation: event.target.value,
                      })
                    }
                  />
                </label>
                <label
                  className="grid gap-2 text-sm font-medium"
                  htmlFor={`points-${questionIndex}`}
                >
                  Puntos
                  <input
                    id={`points-${questionIndex}`}
                    className="h-10 rounded-sm border bg-paper px-3 text-sm outline-none focus:border-jade"
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={question.points}
                    onChange={(event) =>
                      updateQuestion(questionIndex, {
                        points: Number(event.target.value),
                      })
                    }
                    required
                  />
                </label>
              </div>
              <div className="mt-4 space-y-2">
                {question.options.map((option, optionIndex) => (
                  <div className="flex items-center gap-2" key={optionIndex}>
                    <input
                      className="size-4 accent-jade"
                      type="radio"
                      aria-label={`Respuesta correcta de pregunta ${questionIndex + 1}`}
                      name={`correct-${questionIndex}`}
                      checked={option.isCorrect}
                      onChange={() =>
                        setQuestions((current) =>
                          current.map((candidate, candidateIndex) =>
                            candidateIndex === questionIndex
                              ? {
                                  ...candidate,
                                  options: candidate.options.map(
                                    (item, itemIndex) => ({
                                      ...item,
                                      isCorrect: itemIndex === optionIndex,
                                    }),
                                  ),
                                }
                              : candidate,
                          ),
                        )
                      }
                    />
                    <input
                      className="h-10 min-w-0 flex-1 rounded-sm border bg-paper px-3 text-sm outline-none focus:border-jade"
                      value={option.label}
                      onChange={(event) =>
                        updateOption(questionIndex, optionIndex, {
                          label: event.target.value,
                        })
                      }
                      required
                    />
                    {question.options.length > 2 ? (
                      <button
                        className="grid size-10 place-items-center text-alert hover:bg-[#FCEAE6]"
                        type="button"
                        aria-label="Quitar opción"
                        onClick={() =>
                          updateQuestion(questionIndex, {
                            options: question.options.filter(
                              (_, index) => index !== optionIndex,
                            ),
                          })
                        }
                      >
                        <X className="size-4" aria-hidden="true" />
                      </button>
                    ) : null}
                  </div>
                ))}
                <button
                  className="mt-2 inline-flex h-8 items-center gap-2 text-xs font-medium text-jade-deep hover:underline"
                  type="button"
                  onClick={() =>
                    updateQuestion(questionIndex, {
                      options: [
                        ...question.options,
                        { label: "", isCorrect: false },
                      ],
                    })
                  }
                >
                  <Plus className="size-3.5" aria-hidden="true" />
                  Agregar opción
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
      {error ? (
        <p
          className="rounded-sm bg-[#FCEAE6] px-3 py-2 text-sm text-alert"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      <div className="flex justify-end gap-3">
        <button
          className="h-11 rounded-sm border px-4 text-sm"
          type="button"
          onClick={onClose}
          disabled={saving}
        >
          Cancelar
        </button>
        <button
          className="h-11 rounded-sm bg-jade px-4 text-sm font-medium text-white disabled:opacity-60"
          type="submit"
          disabled={saving}
        >
          {saving ? "Guardando" : "Guardar evaluación"}
        </button>
      </div>
    </form>
  );
}

function Assignments({
  course,
  employees,
  enrollments,
}: {
  course: BuilderCourse;
  employees: Employee[];
  enrollments: Enrollment[];
}) {
  const router = useRouter();
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [dueDate, setDueDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const enrollmentsByUserId = new Map(
    enrollments.map((enrollment) => [enrollment.userId, enrollment]),
  );
  const availableEmployees = employees.filter(
    (employee) => !enrollmentsByUserId.has(employee.id),
  );

  function toggleEmployee(userId: string) {
    setSelectedUserIds((current) =>
      current.includes(userId)
        ? current.filter((id) => id !== userId)
        : [...current, userId],
    );
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    startTransition(async () => {
      const response = await assignCourse({
        courseId: course.id,
        userIds: selectedUserIds,
        dueDate: dueDate || null,
      });
      setSaving(false);
      if ("error" in response && response.error) {
        setError(response.error);
        return;
      }
      setSelectedUserIds([]);
      setDueDate("");
      router.refresh();
    });
  }

  function remove(employee: Employee) {
    if (
      !window.confirm(
        `¿Quitar “${course.title}” a ${employee.fullName ?? employee.email}?`,
      )
    )
      return;
    setError(null);
    startTransition(async () => {
      const response = await unassignCourse({
        courseId: course.id,
        userId: employee.id,
      });
      if ("error" in response && response.error) setError(response.error);
      else router.refresh();
    });
  }

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(340px,0.8fr)]">
      <section>
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-medium">Personas asignadas</h2>
            <p className="mt-1 text-sm text-muted">
              Seguimiento actual de este curso.
            </p>
          </div>
          <span className="font-tabular text-sm text-muted">
            {enrollments.length} asignadas
          </span>
        </div>
        <div className="mt-5 divide-y divide-line border border-line">
          {enrollments.length ? (
            enrollments.map((enrollment) => {
              const employee = employees.find(
                (candidate) => candidate.id === enrollment.userId,
              );
              if (!employee) return null;
              return (
                <article
                  className="flex flex-wrap items-center justify-between gap-4 p-4"
                  key={employee.id}
                >
                  <div>
                    <p className="font-medium">
                      {employee.fullName ?? "Sin nombre"}
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      {employee.franchiseName ?? "Sin franquicia"} · Vence:{" "}
                      {enrollment.dueDate ?? "Sin fecha"}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-tabular text-sm">
                      {Math.round(enrollment.progressPercent)}%
                    </span>
                    <button
                      className="grid size-9 place-items-center rounded-sm border text-alert hover:bg-[#FCEAE6]"
                      type="button"
                      title="Quitar asignación"
                      aria-label={`Quitar asignación a ${employee.fullName ?? employee.email}`}
                      onClick={() => remove(employee)}
                    >
                      <X className="size-4" aria-hidden="true" />
                    </button>
                  </div>
                </article>
              );
            })
          ) : (
            <p className="p-5 text-sm text-muted">
              Todavía no hay personas asignadas.
            </p>
          )}
        </div>
      </section>
      <section className="border border-line bg-surface p-5">
        <Users className="size-5 text-jade" aria-hidden="true" />
        <h2 className="mt-5 text-lg font-medium">Asignar personas</h2>
        <p className="mt-1 text-sm leading-6 text-muted">
          Seleccioná empleados o franquiciados activos sin modificar el progreso
          de quienes ya están asignados.
        </p>
        <form className="mt-5" onSubmit={submit}>
          <label
            className="grid gap-2 text-sm font-medium"
            htmlFor="assignment-due-date"
          >
            Fecha límite
            <input
              id="assignment-due-date"
              className="h-11 rounded-sm border bg-paper px-3 text-sm outline-none focus:border-jade"
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
            />
          </label>
          <div className="mt-4 max-h-64 space-y-1 overflow-y-auto border border-line bg-paper p-2">
            {availableEmployees.map((employee) => (
              <label
                className="flex min-h-11 cursor-pointer items-center gap-3 px-2 text-sm hover:bg-surface"
                key={employee.id}
              >
                <input
                  className="size-4 accent-jade"
                  type="checkbox"
                  checked={selectedUserIds.includes(employee.id)}
                  onChange={() => toggleEmployee(employee.id)}
                />
                <span>
                  <span className="block font-medium">
                    {employee.fullName ?? employee.email}
                  </span>
                  <span className="block text-xs text-muted">
                    {employee.franchiseName ?? "Sin franquicia"}
                  </span>
                </span>
              </label>
            ))}
            {!availableEmployees.length ? (
              <p className="p-3 text-sm text-muted">
                No hay personas disponibles para asignar.
              </p>
            ) : null}
          </div>
          {error ? (
            <p
              className="mt-4 rounded-sm bg-[#FCEAE6] px-3 py-2 text-sm text-alert"
              role="alert"
            >
              {error}
            </p>
          ) : null}
          <button
            className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-sm bg-jade px-4 text-sm font-medium text-white disabled:opacity-60"
            type="submit"
            disabled={saving || !selectedUserIds.length}
          >
            {saving
              ? "Asignando"
              : `Asignar ${selectedUserIds.length || ""}`.trim()}
          </button>
        </form>
      </section>
    </div>
  );
}

export function CourseBuilder({
  course,
  modules,
  courseExams,
  employees,
  enrollments,
}: {
  course: BuilderCourse;
  modules: BuilderModule[];
  courseExams: BuilderExam[];
  employees: Employee[];
  enrollments: Enrollment[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"content" | "assignments" | "exams">(
    "content",
  );
  const [moduleEditor, setModuleEditor] = useState<
    "new" | BuilderModule | null
  >(null);
  const [assetEditor, setAssetEditor] = useState<{
    courseModule: BuilderModule;
    asset?: BuilderAsset;
  } | null>(null);
  const [examEditor, setExamEditor] = useState<{
    courseModule?: BuilderModule;
    exam?: BuilderExam;
  } | null>(null);
  const [draggedModuleId, setDraggedModuleId] = useState<string | null>(null);
  const [dragOverModuleId, setDragOverModuleId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function persistModuleOrder(moduleIds: string[]) {
    setNotice(null);
    startTransition(async () => {
      const response = await reorderModules({
        courseId: course.id,
        moduleIds,
      });
      if ("error" in response && response.error) setNotice(response.error);
      else router.refresh();
    });
  }

  function moveModule(courseModule: BuilderModule, direction: -1 | 1) {
    const currentIndex = modules.findIndex(
      (candidate) => candidate.id === courseModule.id,
    );
    const targetIndex = currentIndex + direction;
    if (targetIndex < 0 || targetIndex >= modules.length) return;
    const ids = modules.map((candidate) => candidate.id);
    [ids[currentIndex], ids[targetIndex]] = [
      ids[targetIndex],
      ids[currentIndex],
    ];
    persistModuleOrder(ids);
  }

  function startDraggingModule(
    event: DragEvent<HTMLElement>,
    moduleId: string,
  ) {
    setDraggedModuleId(moduleId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", moduleId);
  }

  function dragModuleOver(event: DragEvent<HTMLElement>, moduleId: string) {
    if (!draggedModuleId || draggedModuleId === moduleId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDragOverModuleId(moduleId);
  }

  function dropModule(event: DragEvent<HTMLElement>, targetModuleId: string) {
    event.preventDefault();
    const sourceModuleId =
      event.dataTransfer.getData("text/plain") || draggedModuleId;
    setDraggedModuleId(null);
    setDragOverModuleId(null);
    if (!sourceModuleId || sourceModuleId === targetModuleId) return;
    const currentIndex = modules.findIndex(
      (candidate) => candidate.id === sourceModuleId,
    );
    const targetIndex = modules.findIndex(
      (candidate) => candidate.id === targetModuleId,
    );
    if (currentIndex < 0 || targetIndex < 0) return;
    const nextModules = [...modules];
    const [movedModule] = nextModules.splice(currentIndex, 1);
    nextModules.splice(targetIndex, 0, movedModule);
    persistModuleOrder(nextModules.map((candidate) => candidate.id));
  }

  function stopDraggingModule() {
    setDraggedModuleId(null);
    setDragOverModuleId(null);
  }

  function removeModule(courseModule: BuilderModule) {
    if (
      !window.confirm(
        `¿Eliminar el módulo “${courseModule.title}” y todo su contenido?`,
      )
    )
      return;
    startTransition(async () => {
      const response = await deleteModule(courseModule.id);
      if ("error" in response && response.error) setNotice(response.error);
      else router.refresh();
    });
  }

  function removeAsset(asset: BuilderAsset) {
    if (!window.confirm(`¿Eliminar “${asset.title}”?`)) return;
    startTransition(async () => {
      const response = await deleteAsset(asset.id);
      if ("error" in response && response.error) setNotice(response.error);
      else router.refresh();
    });
  }

  function removeExam(exam: BuilderExam) {
    if (!window.confirm(`¿Eliminar la evaluación “${exam.title}”?`)) return;
    startTransition(async () => {
      const response = await deleteExam(exam.id);
      if ("error" in response && response.error) setNotice(response.error);
      else router.refresh();
    });
  }

  return (
    <>
      <header className="border-b border-line pb-6">
        <Link
          href="/admin/cursos"
          className="inline-flex items-center gap-2 text-sm text-muted hover:text-ink"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          Cursos
        </Link>
        <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm text-muted">
              {course.isPublished ? "Publicado" : "Borrador"}
            </p>
            <h1 className="mt-2 text-[31px] font-medium leading-tight">
              {course.title}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
              {course.description ??
                "Organizá módulos, contenidos, evaluaciones y asignaciones."}
            </p>
          </div>
          <button
            className="inline-flex h-10 items-center gap-2 rounded-sm border px-3 text-sm font-medium hover:bg-surface"
            type="button"
            onClick={() => setModuleEditor("new")}
          >
            <Plus className="size-4" aria-hidden="true" />
            Agregar módulo
          </button>
        </div>
      </header>
      <nav
        className="mt-6 flex border-b border-line"
        aria-label="Secciones del curso"
      >
        <button
          className={`h-11 border-b-2 px-4 text-sm font-medium ${tab === "content" ? "border-jade text-jade-deep" : "border-transparent text-muted hover:text-ink"}`}
          type="button"
          onClick={() => setTab("content")}
        >
          Contenido
        </button>
        <button
          className={`h-11 border-b-2 px-4 text-sm font-medium ${tab === "assignments" ? "border-jade text-jade-deep" : "border-transparent text-muted hover:text-ink"}`}
          type="button"
          onClick={() => setTab("assignments")}
        >
          Asignaciones
        </button>
        <button
          className={`h-11 border-b-2 px-4 text-sm font-medium ${tab === "exams" ? "border-jade text-jade-deep" : "border-transparent text-muted hover:text-ink"}`}
          type="button"
          onClick={() => setTab("exams")}
        >
          Evaluaciones
        </button>
      </nav>
      {notice ? (
        <p
          className="mt-5 rounded-sm bg-[#FCEAE6] px-3 py-2 text-sm text-alert"
          role="alert"
        >
          {notice}
        </p>
      ) : null}
      {tab === "content" ? (
        <section className="mt-6 space-y-5">
          {modules.map((courseModule, moduleIndex) => (
            <article
              className={`border bg-paper transition ${
                draggedModuleId === courseModule.id
                  ? "border-jade opacity-60"
                  : dragOverModuleId === courseModule.id
                    ? "border-jade ring-1 ring-jade"
                    : "border-line"
              }`}
              key={courseModule.id}
              draggable
              onDragStart={(event) =>
                startDraggingModule(event, courseModule.id)
              }
              onDragOver={(event) => dragModuleOver(event, courseModule.id)}
              onDragLeave={() =>
                setDragOverModuleId((current) =>
                  current === courseModule.id ? null : current,
                )
              }
              onDrop={(event) => dropModule(event, courseModule.id)}
              onDragEnd={stopDraggingModule}
            >
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line p-4">
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className="grid size-9 cursor-grab place-items-center rounded-sm text-muted hover:bg-surface active:cursor-grabbing"
                    title="Arrastrar módulo"
                    aria-label="Arrastrar módulo"
                  >
                    <GripVertical className="size-4" aria-hidden="true" />
                  </span>
                  <span className="font-tabular text-xs text-muted">
                    {String(moduleIndex + 1).padStart(2, "0")}
                  </span>
                  <div className="min-w-0">
                    <h2 className="truncate font-medium">
                      {courseModule.title}
                    </h2>
                    <p className="mt-1 text-xs text-muted">
                      {courseModule.isPublished ? "Publicado" : "Oculto"} ·{" "}
                      {courseModule.assets.length} contenidos ·{" "}
                      {courseModule.exams.length} evaluaciones
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    className="grid size-9 place-items-center rounded-sm hover:bg-surface disabled:opacity-40"
                    type="button"
                    aria-label="Mover módulo arriba"
                    title="Mover arriba"
                    onClick={() => moveModule(courseModule, -1)}
                    disabled={moduleIndex === 0}
                  >
                    <ArrowUp className="size-4" aria-hidden="true" />
                  </button>
                  <button
                    className="grid size-9 place-items-center rounded-sm hover:bg-surface disabled:opacity-40"
                    type="button"
                    aria-label="Mover módulo abajo"
                    title="Mover abajo"
                    onClick={() => moveModule(courseModule, 1)}
                    disabled={moduleIndex === modules.length - 1}
                  >
                    <ArrowDown className="size-4" aria-hidden="true" />
                  </button>
                  <button
                    className="grid size-9 place-items-center rounded-sm hover:bg-surface"
                    type="button"
                    aria-label={`Editar ${courseModule.title}`}
                    title="Editar módulo"
                    onClick={() => setModuleEditor(courseModule)}
                  >
                    <Pencil className="size-4" aria-hidden="true" />
                  </button>
                  <button
                    className="grid size-9 place-items-center rounded-sm text-alert hover:bg-[#FCEAE6]"
                    type="button"
                    aria-label={`Eliminar ${courseModule.title}`}
                    title="Eliminar módulo"
                    onClick={() => removeModule(courseModule)}
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
              {courseModule.description ? (
                <p className="px-4 pt-4 text-sm leading-6 text-muted">
                  {courseModule.description}
                </p>
              ) : null}
              <div className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-sm font-medium">Contenidos</h3>
                  <button
                    className="inline-flex h-9 items-center gap-2 rounded-sm border px-3 text-sm font-medium hover:bg-surface"
                    type="button"
                    onClick={() => setAssetEditor({ courseModule })}
                  >
                    <Plus className="size-4" aria-hidden="true" />
                    Agregar contenido
                  </button>
                </div>
                {courseModule.assets.length ? (
                  <div className="mt-3 divide-y divide-line border border-line">
                    {courseModule.assets.map((asset) => {
                      const Icon = assetIcon(asset.type);
                      return (
                        <div
                          className="flex flex-wrap items-center justify-between gap-3 p-3"
                          key={asset.id}
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <Icon
                              className="size-4 shrink-0 text-jade-deep"
                              aria-hidden="true"
                            />
                            <span className="truncate text-sm">
                              {asset.title}
                            </span>
                            <span className="text-xs text-muted">
                              {asset.storagePath
                                ? "Archivo privado"
                                : asset.type}
                            </span>
                          </div>
                          <div className="flex gap-1">
                            <button
                              className="grid size-8 place-items-center rounded-sm hover:bg-surface"
                              type="button"
                              aria-label={`Editar ${asset.title}`}
                              title="Editar contenido"
                              onClick={() =>
                                setAssetEditor({ courseModule, asset })
                              }
                            >
                              <Pencil className="size-4" aria-hidden="true" />
                            </button>
                            <button
                              className="grid size-8 place-items-center rounded-sm text-alert hover:bg-[#FCEAE6]"
                              type="button"
                              aria-label={`Eliminar ${asset.title}`}
                              title="Eliminar contenido"
                              onClick={() => removeAsset(asset)}
                            >
                              <Trash2 className="size-4" aria-hidden="true" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-muted">
                    No hay contenidos en este módulo.
                  </p>
                )}
                <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-sm font-medium">
                    Evaluaciones del módulo
                  </h3>
                  <button
                    className="inline-flex h-9 items-center gap-2 rounded-sm border px-3 text-sm font-medium hover:bg-surface"
                    type="button"
                    onClick={() => setExamEditor({ courseModule })}
                  >
                    <Plus className="size-4" aria-hidden="true" />
                    Agregar evaluación
                  </button>
                </div>
                {courseModule.exams.length ? (
                  <div className="mt-3 divide-y divide-line border border-line">
                    {courseModule.exams.map((exam) => (
                      <div
                        className="flex flex-wrap items-center justify-between gap-3 p-3"
                        key={exam.id}
                      >
                        <div>
                          <p className="text-sm font-medium">{exam.title}</p>
                          <p className="mt-1 text-xs text-muted">
                            {exam.questions.length} preguntas ·{" "}
                            {exam.passingScore}% para aprobar
                          </p>
                        </div>
                        <div className="flex gap-1">
                          <button
                            className="grid size-8 place-items-center rounded-sm hover:bg-surface"
                            type="button"
                            aria-label={`Editar ${exam.title}`}
                            title="Editar evaluación"
                            onClick={() =>
                              setExamEditor({ courseModule, exam })
                            }
                          >
                            <Pencil className="size-4" aria-hidden="true" />
                          </button>
                          <button
                            className="grid size-8 place-items-center rounded-sm text-alert hover:bg-[#FCEAE6]"
                            type="button"
                            aria-label={`Eliminar ${exam.title}`}
                            title="Eliminar evaluación"
                            onClick={() => removeExam(exam)}
                          >
                            <Trash2 className="size-4" aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-muted">
                    No hay evaluaciones en este módulo.
                  </p>
                )}
              </div>
            </article>
          ))}
          {!modules.length ? (
            <section className="border border-dashed border-line bg-surface p-8">
              <BookOpen className="size-6 text-jade" aria-hidden="true" />
              <h2 className="mt-5 text-lg font-medium">
                Este curso todavía no tiene módulos
              </h2>
              <p className="mt-2 text-sm text-muted">
                Creá el primer módulo para sumar contenidos y evaluaciones.
              </p>
            </section>
          ) : null}
        </section>
      ) : null}
      {tab === "assignments" ? (
        <section className="mt-6">
          <Assignments
            course={course}
            employees={employees}
            enrollments={enrollments}
          />
        </section>
      ) : null}
      {tab === "exams" ? (
        <section className="mt-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-lg font-medium">
                Evaluación final del curso
              </h2>
              <p className="mt-1 text-sm text-muted">
                Estas evaluaciones no pertenecen a un módulo específico.
              </p>
            </div>
            <button
              className="inline-flex h-10 items-center gap-2 rounded-sm bg-jade px-4 text-sm font-medium text-white hover:bg-jade-deep"
              type="button"
              onClick={() => setExamEditor({})}
            >
              <Plus className="size-4" aria-hidden="true" />
              Agregar evaluación final
            </button>
          </div>
          <div className="mt-5 divide-y divide-line border border-line bg-paper">
            {courseExams.map((exam) => (
              <article
                className="flex flex-wrap items-center justify-between gap-4 p-4"
                key={exam.id}
              >
                <div>
                  <p className="font-medium">{exam.title}</p>
                  <p className="mt-1 text-sm text-muted">
                    {exam.questions.length} preguntas · {exam.passingScore}%
                    para aprobar · {exam.isActive ? "Activa" : "Inactiva"}
                  </p>
                </div>
                <div className="flex gap-1">
                  <button
                    className="grid size-9 place-items-center rounded-sm border hover:bg-surface"
                    type="button"
                    aria-label={`Editar ${exam.title}`}
                    title="Editar evaluación"
                    onClick={() => setExamEditor({ exam })}
                  >
                    <Pencil className="size-4" aria-hidden="true" />
                  </button>
                  <button
                    className="grid size-9 place-items-center rounded-sm border text-alert hover:bg-[#FCEAE6]"
                    type="button"
                    aria-label={`Eliminar ${exam.title}`}
                    title="Eliminar evaluación"
                    onClick={() => removeExam(exam)}
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </button>
                </div>
              </article>
            ))}
            {!courseExams.length ? (
              <div className="p-6 text-sm text-muted">
                Todavía no agregaste una evaluación final.
              </div>
            ) : null}
          </div>
        </section>
      ) : null}
      {moduleEditor ? (
        <Dialog
          title={moduleEditor === "new" ? "Agregar módulo" : "Editar módulo"}
          onClose={() => setModuleEditor(null)}
        >
          <ModuleForm
            key={moduleEditor === "new" ? "new" : moduleEditor.id}
            courseId={course.id}
            courseModule={moduleEditor === "new" ? undefined : moduleEditor}
            nextOrderIndex={
              Math.max(
                0,
                ...modules.map((courseModule) => courseModule.orderIndex),
              ) + 1
            }
            onClose={() => setModuleEditor(null)}
          />
        </Dialog>
      ) : null}
      {assetEditor ? (
        <Dialog
          title={assetEditor.asset ? "Editar contenido" : "Agregar contenido"}
          onClose={() => setAssetEditor(null)}
        >
          <AssetForm
            key={assetEditor.asset?.id ?? `${assetEditor.courseModule.id}-new`}
            course={course}
            courseModule={assetEditor.courseModule}
            asset={assetEditor.asset}
            onClose={() => setAssetEditor(null)}
          />
        </Dialog>
      ) : null}
      {examEditor ? (
        <Dialog
          title={
            examEditor.exam
              ? "Editar evaluación"
              : examEditor.courseModule
                ? "Agregar evaluación de módulo"
                : "Agregar evaluación final"
          }
          onClose={() => setExamEditor(null)}
        >
          <ExamForm
            key={
              examEditor.exam?.id ??
              `${examEditor.courseModule?.id ?? course.id}-new`
            }
            course={course}
            courseModule={examEditor.courseModule}
            exam={examEditor.exam}
            onClose={() => setExamEditor(null)}
          />
        </Dialog>
      ) : null}
    </>
  );
}
