export type CourseAssetType = "video" | "pdf" | "image" | "spreadsheet" | "document" | "text" | "link";

export type PendingCourseAssetFile = {
  file: File;
  type: CourseAssetType;
  contentType: string;
};

export const courseAssetFileAccept = ".mp4,.webm,.pdf,.jpg,.jpeg,.png,.webp,.gif,.xlsx,.xls,.csv,.doc,.docx,.ppt,.pptx";
export const courseCoverFileAccept = ".jpg,.jpeg,.png,.webp,.gif";

export function detectCourseAssetFile(file: File): PendingCourseAssetFile | null {
  const extension = file.name.split(".").pop()?.toLowerCase();
  const type = file.type.toLowerCase();

  if (type === "video/mp4" || extension === "mp4") return { file, type: "video", contentType: "video/mp4" };
  if (type === "video/webm" || extension === "webm") return { file, type: "video", contentType: "video/webm" };
  if (type === "application/pdf" || extension === "pdf") return { file, type: "pdf", contentType: "application/pdf" };
  if (type === "image/jpeg" || extension === "jpg" || extension === "jpeg") return { file, type: "image", contentType: "image/jpeg" };
  if (type === "image/png" || extension === "png") return { file, type: "image", contentType: "image/png" };
  if (type === "image/webp" || extension === "webp") return { file, type: "image", contentType: "image/webp" };
  if (type === "image/gif" || extension === "gif") return { file, type: "image", contentType: "image/gif" };
  if (type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" || extension === "xlsx") return { file, type: "spreadsheet", contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
  if (type === "application/vnd.ms-excel" || extension === "xls") return { file, type: "spreadsheet", contentType: "application/vnd.ms-excel" };
  if (type === "text/csv" || extension === "csv") return { file, type: "spreadsheet", contentType: "text/csv" };
  if (type === "application/msword" || extension === "doc") return { file, type: "document", contentType: "application/msword" };
  if (type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || extension === "docx") return { file, type: "document", contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };
  if (type === "application/vnd.ms-powerpoint" || extension === "ppt") return { file, type: "document", contentType: "application/vnd.ms-powerpoint" };
  if (type === "application/vnd.openxmlformats-officedocument.presentationml.presentation" || extension === "pptx") return { file, type: "document", contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation" };
  return null;
}

export function detectCourseCoverFile(file: File) {
  const detected = detectCourseAssetFile(file);
  return detected?.type === "image" ? detected : null;
}