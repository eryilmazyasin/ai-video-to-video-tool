export interface UploadcareFileInfo {
  uuid: string;
  sizeBytes: number;
  mimeType: string;
  originalFilename: string;
  originalFileUrl: string;
  cdnUrl: string;
  isReady: boolean;
  isStored: boolean;
}
