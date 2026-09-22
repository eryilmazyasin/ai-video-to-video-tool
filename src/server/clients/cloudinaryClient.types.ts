export interface UploadSourceImageFromUrlInput {
  sourceUrl: string;
  uploadcareUuid: string;
}

export interface UploadOutputImageFromUrlInput {
  sourceUrl: string;
  providerJobId: string;
  outputIndex: number;
}

export interface CloudinaryImageUpload {
  publicId: string;
  secureUrl: string;
  bytes: number | null;
  format: string | null;
}

export interface UploadImageFromUrlInput {
  sourceUrl: string;
  publicId: string;
  overwrite?: boolean;
}
