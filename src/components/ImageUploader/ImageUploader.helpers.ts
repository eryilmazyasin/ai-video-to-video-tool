import type {
  UploadApiResponse,
  UploadcareFailedEntry,
} from "@/components/ImageUploader/ImageUploader.types";

export function getUploadcareErrorMessage(entry: UploadcareFailedEntry) {
  const message = entry.errors[0]?.message;

  return message || "Uploadcare could not upload this image. Please try again.";
}

export function isUploadApiResponse(value: unknown): value is UploadApiResponse {
  if (!value || typeof value !== "object") return false;

  const transformation = (value as Record<string, unknown>).transformation;

  if (!transformation || typeof transformation !== "object") return false;

  const sourceImage = (transformation as Record<string, unknown>).sourceImage;

  return Boolean(
    sourceImage &&
      typeof sourceImage === "object" &&
      typeof (transformation as Record<string, unknown>).id === "string" &&
      (transformation as Record<string, unknown>).status === "ready" &&
      typeof (sourceImage as Record<string, unknown>).url === "string" &&
      typeof (sourceImage as Record<string, unknown>).originalName === "string" &&
      typeof (sourceImage as Record<string, unknown>).mimeType === "string" &&
      typeof (sourceImage as Record<string, unknown>).bytes === "number",
  );
}
