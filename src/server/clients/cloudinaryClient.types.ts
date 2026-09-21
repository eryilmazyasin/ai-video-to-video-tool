export interface UploadSourceVideoFromUrlInput {
  sourceUrl: string;
  uploadcareUuid: string;
}

export interface UploadOutputVideoFromUrlInput {
  sourceUrl: string;
  providerJobId: string;
}

export interface CloudinaryVideoUpload {
  publicId: string;
  secureUrl: string;
  bytes: number | null;
  format: string | null;
  duration: number | null;
}

export interface UploadVideoFromUrlInput {
  sourceUrl: string;
  publicId: string;
  overwrite?: boolean;
}
