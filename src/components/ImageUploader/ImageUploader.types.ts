import type { OutputFileEntry } from "@uploadcare/file-uploader";

export type UploadStage = "idle" | "uploading" | "preparing" | "ready" | "error";

export type UploadcareUploadingEntry = OutputFileEntry<"uploading">;
export type UploadcareSuccessEntry = OutputFileEntry<"success">;
export type UploadcareFailedEntry = OutputFileEntry<"failed">;
export type UploadcareIdleEntry = OutputFileEntry<"idle">;

export interface PreparedSourceImage {
  url: string;
  originalName: string;
  mimeType: string;
  bytes: number;
}

export interface UploadApiResponse {
  transformation: {
    id: string;
    status: "ready";
    sourceImage: PreparedSourceImage;
  };
}

export interface ImageUploaderProps {
  onTransformationQueued?: (transformationId: string) => void;
}
