import "server-only";

import { getMagicHourApiEnv } from "@/server/config/env";
import { Client } from "magic-hour";

import type {
  MagicHourAccountSummary,
  MagicHourImageToImageRequest,
  MagicHourImageToImageResponse,
} from "@/server/clients/magicHourClient.types";

declare global {
  var magicHourClient: Client | undefined;
  var magicHourClientApiKey: string | undefined;
}

function getMagicHourClient() {
  const { apiKey } = getMagicHourApiEnv();

  if (!globalThis.magicHourClient || globalThis.magicHourClientApiKey !== apiKey) {
    // Recreate the client when a server process receives a rotated API key.
    globalThis.magicHourClient = new Client({ token: apiKey, lazyLoad: true });
    globalThis.magicHourClientApiKey = apiKey;
  }

  return globalThis.magicHourClient;
}

export function createMagicHourImageToImage(
  request: MagicHourImageToImageRequest,
): Promise<MagicHourImageToImageResponse> {
  return getMagicHourClient().v1.aiImageEditor.create(request);
}

export async function getMagicHourAccountSummary(): Promise<MagicHourAccountSummary | null> {
  try {
    const account = await getMagicHourClient().v1.account.list();

    return {
      accountIdSuffix: account.id.slice(-6),
      credits: account.credits,
      tier: account.tier,
    };
  } catch {
    return null;
  }
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
