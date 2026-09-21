export interface UploadcareFileInfo {
  uuid: string;
  sizeBytes: number;
  mimeType: string;
  originalFilename: string;
  originalFileUrl: string | null;
  cdnUrl: string;
  isReady: boolean;
  isStored: boolean;
}
