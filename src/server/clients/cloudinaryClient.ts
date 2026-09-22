import "server-only";

import { getCloudinaryEnv } from "@/server/config/env";
import { v2 as cloudinary } from "cloudinary";

import type {
  CloudinaryImageUpload,
  UploadImageFromUrlInput,
  UploadOutputImageFromUrlInput,
  UploadSourceImageFromUrlInput,
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
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function getRequiredPublicId(value: unknown) {
  const publicId = getOptionalString(value);

  if (!publicId) {
    throw new Error(
      "Cloudinary did not return a public ID for the uploaded image.",
    );
  }

  return publicId;
}

function getRequiredSecureUrl(value: unknown) {
  const secureUrl = getOptionalString(value);

  if (!secureUrl?.startsWith("https://")) {
    throw new Error(
      "Cloudinary did not return a secure URL for the uploaded image.",
    );
  }

  return secureUrl;
}

function getUploadResponseValue(response: unknown, fieldName: string) {
  if (typeof response !== "object" || !response) {
    return undefined;
  }

  return (response as Record<string, unknown>)[fieldName];
}

function normalizeUploadResponse(response: unknown): CloudinaryImageUpload {
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
  };
}

async function uploadImageFromUrl(
  input: UploadImageFromUrlInput,
): Promise<CloudinaryImageUpload> {
  let response: unknown;

  try {
    response = await getCloudinaryClient().uploader.upload(input.sourceUrl, {
      resource_type: "image",
      public_id: input.publicId,
      overwrite: input.overwrite ?? false,
    });
  } catch {
    // Do not expose provider details because they can include signed URLs.
    throw new Error("Cloudinary could not upload the image. Please try again.");
  }

  return normalizeUploadResponse(response);
}

export function uploadSourceImageFromUrl(
  input: UploadSourceImageFromUrlInput,
): Promise<CloudinaryImageUpload> {
  const uploadcareUuid = validatePublicIdSegment(
    input.uploadcareUuid,
    "Uploadcare UUID",
  );

  return uploadImageFromUrl({
    sourceUrl: input.sourceUrl,
    publicId: `ai-image-to-image/sources/${uploadcareUuid}`,
  });
}

export function uploadOutputImageFromUrl(
  input: UploadOutputImageFromUrlInput,
): Promise<CloudinaryImageUpload> {
  const providerJobId = validatePublicIdSegment(
    input.providerJobId,
    "Provider job ID",
  );

  if (!Number.isInteger(input.outputIndex) || input.outputIndex < 0 || input.outputIndex >= 16) {
    throw new Error("Output index must be between 0 and 15.");
  }

  return uploadImageFromUrl({
    sourceUrl: input.sourceUrl,
    publicId: `ai-image-to-image/outputs/${providerJobId}-${input.outputIndex + 1}`,
    // A retry must be able to replace the same deterministic output asset.
    overwrite: true,
  });
}
