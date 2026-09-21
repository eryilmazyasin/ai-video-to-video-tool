import "server-only";

import {
  fileInfo,
  UploadcareAuthSchema,
  type FileInfo,
} from "@uploadcare/rest-client";

import { getUploadcareEnv } from "@/server/config/env";
import type { UploadcareFileInfo } from "@/server/clients/uploadcareClient.types";

const uploadcareUuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

declare global {
  var uploadcareAuthSchema: UploadcareAuthSchema | undefined;
}

function getUploadcareAuthSchema() {
  if (!globalThis.uploadcareAuthSchema) {
    const { publicKey, secretKey } = getUploadcareEnv();

    // Signature auth keeps the secret key out of each request header.
    globalThis.uploadcareAuthSchema = new UploadcareAuthSchema({
      publicKey,
      secretKey,
    });
  }

  return globalThis.uploadcareAuthSchema;
}

function validateUploadcareUuid(value: string) {
  const uuid = value.trim();

  if (!uploadcareUuidPattern.test(uuid)) {
    throw new Error("Uploadcare file ID must be a valid UUID.");
  }

  return uuid;
}

function getRequiredHttpsUrl(value: string, fieldName: string) {
  if (!value.startsWith("https://")) {
    throw new Error(`Uploadcare did not return a secure ${fieldName}.`);
  }

  return value;
}

function getOptionalHttpsUrl(value: string | null, fieldName: string) {
  if (!value) {
    return null;
  }

  return getRequiredHttpsUrl(value, fieldName);
}

function normalizeFileInfo(file: FileInfo): UploadcareFileInfo {
  return {
    uuid: file.uuid,
    sizeBytes: file.size,
    mimeType: file.mimeType,
    originalFilename: file.originalFilename,
    originalFileUrl: getOptionalHttpsUrl(
      file.originalFileUrl,
      "original file URL",
    ),
    cdnUrl: getRequiredHttpsUrl(file.url, "CDN URL"),
    isReady: file.isReady,
    isStored: Boolean(file.datetimeStored),
  };
}

export async function getUploadcareFileInfo(
  uploadcareUuid: string,
): Promise<UploadcareFileInfo> {
  const uuid = validateUploadcareUuid(uploadcareUuid);

  try {
    const response = await fileInfo(
      { uuid },
      { authSchema: getUploadcareAuthSchema() },
    );

    return normalizeFileInfo(response);
  } catch {
    // Provider errors can contain internal URLs, so keep this safe for API responses.
    throw new Error("Uploadcare could not verify the uploaded file. Please try again.");
  }
}
