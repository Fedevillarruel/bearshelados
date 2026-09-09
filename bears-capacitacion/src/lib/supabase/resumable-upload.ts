"use client";

import { Upload } from "tus-js-client";
import { createClient } from "@/lib/supabase/client";

const uploadChunkSize = 6 * 1024 * 1024;

type ResumableUploadInput = {
  bucket: string;
  path: string;
  token: string;
  file: File;
  contentType?: string;
};

function resumableUploadEndpoint() {
  const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!configuredUrl) throw new Error("Supabase no está configurado.");

  const url = new URL(configuredUrl);
  if (url.hostname.endsWith(".supabase.co") && !url.hostname.endsWith(".storage.supabase.co")) {
    url.hostname = url.hostname.replace(/\.supabase\.co$/, ".storage.supabase.co");
  }
  url.pathname = "/storage/v1/upload/resumable";
  url.search = "";
  url.hash = "";
  return url.toString();
}

function uploadErrorMessage(error: unknown) {
  if (typeof error === "object" && error) {
    const candidate = error as { message?: unknown; originalResponse?: { getBody?: () => string } };
    const responseBody = candidate.originalResponse?.getBody?.();
    if (responseBody) {
      try {
        const parsed = JSON.parse(responseBody) as { statusCode?: string; error?: string; message?: string; code?: string };
        return [parsed.statusCode, parsed.error, parsed.message, parsed.code].filter(Boolean).join(" - ");
      } catch {
        return responseBody;
      }
    }
    if (typeof candidate.message === "string" && candidate.message) return candidate.message;
  }
  if (error instanceof Error && error.message) return error.message;
  return "No pudimos subir el archivo.";
}

export async function uploadPrivateFile({ bucket, path, file, contentType }: ResumableUploadInput) {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const accessToken = session?.access_token;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!accessToken || !anonKey) throw new Error("La sesión de administrador no está disponible para subir archivos.");

  return new Promise<void>((resolve, reject) => {
    const upload = new Upload(file, {
      endpoint: resumableUploadEndpoint(),
      chunkSize: uploadChunkSize,
      retryDelays: [0, 1_000, 3_000, 5_000, 10_000],
      removeFingerprintOnSuccess: true,
      uploadDataDuringCreation: true,
      headers: { authorization: `Bearer ${accessToken}`, apikey: anonKey },
      metadata: {
        bucketName: bucket,
        objectName: path,
        contentType: contentType || file.type || "application/octet-stream",
        cacheControl: "3600",
      },
      onError: (error) => reject(new Error(uploadErrorMessage(error))),
      onSuccess: () => resolve(),
    });

    upload.start();
  });
}