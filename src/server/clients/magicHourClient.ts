import "server-only";

import { Client } from "magic-hour";

import { getMagicHourApiEnv } from "@/server/config/env";
import type {
  MagicHourVideoToVideoRequest,
  MagicHourVideoToVideoResponse,
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

export function createMagicHourVideoToVideo(
  request: MagicHourVideoToVideoRequest,
): Promise<MagicHourVideoToVideoResponse> {
  return getMagicHourClient().v1.videoToVideo.create(request);
}
