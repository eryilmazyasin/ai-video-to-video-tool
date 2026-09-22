import "server-only";

import { Client } from "magic-hour";

import { getMagicHourApiEnv } from "@/server/config/env";
import type {
  MagicHourImageToImageRequest,
  MagicHourImageToImageResponse,
} from "@/server/clients/magicHourClient.types";

declare global {
  var magicHourClient: Client | undefined;
}

function getMagicHourClient() {
  if (!globalThis.magicHourClient) {
    const { apiKey } = getMagicHourApiEnv();

    // Configure on first use so routes that do not use Magic Hour do not require its env values.
    globalThis.magicHourClient = new Client({ token: apiKey, lazyLoad: true });
  }

  return globalThis.magicHourClient;
}

export function createMagicHourImageToImage(
  request: MagicHourImageToImageRequest,
): Promise<MagicHourImageToImageResponse> {
  return getMagicHourClient().v1.aiImageEditor.create(request);
}

function getSafeProviderField(value: unknown) {
  return typeof value === "string" ? value.slice(0, 500) : undefined;
}

export async function getMagicHourErrorDetails(error: unknown) {
  const details: Record<string, string | number> = {
    name: error instanceof Error ? error.name : "UnknownError",
    message:
      error instanceof Error
        ? error.message.slice(0, 500)
        : "Unknown Magic Hour error",
  };

  if (!error || typeof error !== "object") {
    return details;
  }

  const response = (error as Record<string, unknown>).response;

  if (!response || typeof response !== "object") {
    return details;
  }

  const status = (response as Record<string, unknown>).status;
  const clone = (response as Record<string, unknown>).clone;

  if (typeof status === "number") {
    details.status = status;
  }

  if (typeof clone !== "function") {
    return details;
  }

  try {
    const body: unknown = await clone.call(response).json();

    if (body && typeof body === "object") {
      const bodyRecord = body as Record<string, unknown>;
      const code = getSafeProviderField(bodyRecord.code);
      const message = getSafeProviderField(bodyRecord.message);
      const detail = getSafeProviderField(bodyRecord.detail);
      const providerError = getSafeProviderField(bodyRecord.error);

      if (code) details.providerCode = code;
      if (message) details.providerMessage = message;
      if (detail) details.providerDetail = detail;
      if (providerError) details.providerError = providerError;
    }
  } catch {
    // Some provider errors do not include a JSON response body.
  }

  return details;
}
