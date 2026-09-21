import type { OutputFileEntry } from "@uploadcare/file-uploader";

export type UploadStage = "idle" | "uploading" | "preparing" | "ready" | "error";

export type UploadcareUploadingEntry = OutputFileEntry<"uploading">;
export type UploadcareSuccessEntry = OutputFileEntry<"success">;
export type UploadcareFailedEntry = OutputFileEntry<"failed">;

export interface PreparedSourceVideo {
  url: string;
  originalName: string;
  mimeType: string;
  bytes: number;
}

export interface UploadApiResponse {
  transformation: {
    id: string;
    status: "ready";
    sourceVideo: PreparedSourceVideo;
  };
}
