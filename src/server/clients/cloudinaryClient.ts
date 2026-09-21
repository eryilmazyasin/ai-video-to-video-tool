import "server-only";

import { v2 as cloudinary } from "cloudinary";

import { getCloudinaryEnv } from "@/server/config/env";
import type {
  CloudinaryVideoUpload,
  UploadOutputVideoFromUrlInput,
  UploadSourceVideoFromUrlInput,
  UploadVideoFromUrlInput,
} from "@/server/clients/cloudinaryClient.types";

const publicIdSegmentPattern = /^[A-Za-z0-9_-]{1,128}$/;

declare global {
  var cloudinaryIsConfigured: boolean | undefined;
}

function getCloudinaryClient() {
  if (!globalThis.cloudinaryIsConfigured) {
    const { cloudName, apiKey, apiSecret } = getCloudinaryEnv();

    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
      secure: true,
    });

    // Reuse the SDK configuration during warm serverless requests and reloads.
    globalThis.cloudinaryIsConfigured = true;
  }

  return cloudinary;
}

function validatePublicIdSegment(value: string, fieldName: string) {
  const sanitizedValue = value.trim();

  if (!publicIdSegmentPattern.test(sanitizedValue)) {
    throw new Error(
      `${fieldName} must contain 1 to 128 letters, numbers, hyphens, or underscores.`,
    );
  }

  return sanitizedValue;
}

function getOptionalString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue = value.trim();

  return normalizedValue || null;
}

function getOptionalNonNegativeNumber(value: unknown) {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0
    ? value
    : null;
}

function getRequiredPublicId(value: unknown) {
  const publicId = getOptionalString(value);

  if (!publicId) {
    throw new Error("Cloudinary did not return a public ID for the uploaded video.");
  }

  return publicId;
}

function getRequiredSecureUrl(value: unknown) {
  const secureUrl = getOptionalString(value);

  if (!secureUrl?.startsWith("https://")) {
    throw new Error("Cloudinary did not return a secure URL for the uploaded video.");
  }

  return secureUrl;
}

function getUploadResponseValue(response: unknown, fieldName: string) {
  if (typeof response !== "object" || !response) {
    return undefined;
  }

  return (response as Record<string, unknown>)[fieldName];
}

function normalizeUploadResponse(response: unknown): CloudinaryVideoUpload {
  return {
    publicId: getRequiredPublicId(
      getUploadResponseValue(response, "public_id"),
    ),
    secureUrl: getRequiredSecureUrl(
      getUploadResponseValue(response, "secure_url"),
    ),
    bytes: getOptionalNonNegativeNumber(
      getUploadResponseValue(response, "bytes"),
    ),
    format: getOptionalString(getUploadResponseValue(response, "format")),
    duration: getOptionalNonNegativeNumber(
      getUploadResponseValue(response, "duration"),
    ),
  };
}

async function uploadVideoFromUrl(
  input: UploadVideoFromUrlInput,
): Promise<CloudinaryVideoUpload> {
  let response: unknown;

  try {
    response = await getCloudinaryClient().uploader.upload(input.sourceUrl, {
      resource_type: "video",
      public_id: input.publicId,
      overwrite: input.overwrite ?? false,
    });
  } catch {
    // Do not expose provider details because they can include signed URLs.
    throw new Error("Cloudinary could not upload the video. Please try again.");
  }

  return normalizeUploadResponse(response);
}

export function uploadSourceVideoFromUrl(
  input: UploadSourceVideoFromUrlInput,
): Promise<CloudinaryVideoUpload> {
  const uploadcareUuid = validatePublicIdSegment(
    input.uploadcareUuid,
    "Uploadcare UUID",
  );

  return uploadVideoFromUrl({
    sourceUrl: input.sourceUrl,
    publicId: `ai-video-to-video/sources/${uploadcareUuid}`,
  });
}

export function uploadOutputVideoFromUrl(
  input: UploadOutputVideoFromUrlInput,
): Promise<CloudinaryVideoUpload> {
  const providerJobId = validatePublicIdSegment(
    input.providerJobId,
    "Provider job ID",
  );

  return uploadVideoFromUrl({
    sourceUrl: input.sourceUrl,
    publicId: `ai-video-to-video/outputs/${providerJobId}`,
    // A retry must be able to replace the same deterministic output asset.
    overwrite: true,
  });
}
