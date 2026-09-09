"use client";

import { Upload } from "tus-js-client";

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

export function uploadPrivateFile({ bucket, path, token, file, contentType }: ResumableUploadInput) {
  return new Promise<void>((resolve, reject) => {
    const upload = new Upload(file, {
      endpoint: resumableUploadEndpoint(),
      chunkSize: uploadChunkSize,
      retryDelays: [0, 1_000, 3_000, 5_000, 10_000],
      removeFingerprintOnSuccess: true,
      uploadDataDuringCreation: true,
      headers: { "x-signature": token },
      metadata: {
        bucketName: bucket,
        objectName: path,
        contentType: contentType || file.type || "application/octet-stream",
        cacheControl: "3600",
      },
      onError: reject,
      onSuccess: () => resolve(),
    });

    upload.start();
  });
}