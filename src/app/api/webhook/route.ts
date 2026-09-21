import { uploadOutputVideoFromUrl } from "@/server/clients/cloudinaryClient";
import { getMagicHourWebhookEnv } from "@/server/config/env";
import {
  claimForOutputSave,
  findByProviderJobId,
  markCompletedFromOutput,
  markOutputCopyFailed,
  markProcessingByProviderJobId,
  markProviderErrored,
} from "@/server/db-actions/transformationActions";
import {
  getFirstHttpsDownloadUrl,
  getMagicHourWebhookHeaders,
  parseMagicHourWebhookEvent,
  readMagicHourWebhookBody,
  verifyMagicHourWebhook,
} from "@/server/webhooks/magicHourWebhook";
import type {
  MagicHourVideoCompletedEvent,
  MagicHourVideoEvent,
} from "@/server/webhooks/magicHourWebhook.types";

import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

function acknowledgement(state: string) {
  return NextResponse.json({ received: true, state });
}

async function recordRetryableOutputFailure(transformationId: Parameters<typeof markOutputCopyFailed>[0]) {
  try {
    await markOutputCopyFailed(transformationId);
  } catch {
    // A non-2xx response still asks the provider to retry this delivery.
  }
}

async function handleCompletedEvent(event: MagicHourVideoCompletedEvent) {
  const downloadUrl = getFirstHttpsDownloadUrl(event);

  if (!downloadUrl) {
    return NextResponse.json({ error: "The completed event is invalid." }, { status: 400 });
  }

  let claimedTransformation;

  try {
    claimedTransformation = await claimForOutputSave(event.payload.id, {
      rawStatus: event.payload.status,
      ...(event.payload.creditsCharged !== undefined
        ? { creditsCharged: event.payload.creditsCharged }
        : {}),
    });
  } catch {
    return NextResponse.json({ error: "The event could not be recorded." }, { status: 500 });
  }

  if (!claimedTransformation) {
    return acknowledgement("ignored");
  }

  let outputVideo;

  try {
    // The output copy is intentionally inline so a failed delivery can be retried safely.
    outputVideo = await uploadOutputVideoFromUrl({
      sourceUrl: downloadUrl,
      providerJobId: event.payload.id,
    });
  } catch {
    await recordRetryableOutputFailure(claimedTransformation._id);

    return NextResponse.json(
      { error: "The generated video could not be saved." },
      { status: 502 },
    );
  }

  try {
    const completedTransformation = await markCompletedFromOutput(
      claimedTransformation._id,
      {
        cloudinaryPublicId: outputVideo.publicId,
        cloudinaryUrl: outputVideo.secureUrl,
        rawStatus: event.payload.status,
        ...(event.payload.creditsCharged !== undefined
          ? { creditsCharged: event.payload.creditsCharged }
          : {}),
      },
    );

    if (!completedTransformation) {
      throw new Error("The output claim was lost.");
    }
  } catch {
    await recordRetryableOutputFailure(claimedTransformation._id);

    return NextResponse.json({ error: "The event could not be finalized." }, { status: 500 });
  }

  return acknowledgement("completed");
}

async function handleVideoEvent(event: MagicHourVideoEvent) {
  try {
    const transformation = await findByProviderJobId(event.payload.id);

    if (!transformation) {
      return acknowledgement("ignored");
    }
  } catch {
    return NextResponse.json({ error: "The event could not be recorded." }, { status: 500 });
  }

  if (event.type === "video.started") {
    try {
      await markProcessingByProviderJobId(event.payload.id, event.payload.status);
    } catch {
      return NextResponse.json({ error: "The event could not be recorded." }, { status: 500 });
    }

    return acknowledgement("processing");
  }

  if (event.type === "video.errored") {
    try {
      const failedTransformation = await markProviderErrored(
        event.payload.id,
        event.payload.status,
      );

      if (!failedTransformation) {
        return acknowledgement("ignored");
      }
    } catch {
      return NextResponse.json({ error: "The event could not be recorded." }, { status: 500 });
    }

    return acknowledgement("failed");
  }

  return handleCompletedEvent(event);
}

export async function POST(request: NextRequest) {
  let rawBody: string | null;

  try {
    rawBody = await readMagicHourWebhookBody(request);
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (rawBody === null) {
    return NextResponse.json({ error: "Request body is too large." }, { status: 413 });
  }

  let webhookSecret: string;

  try {
    webhookSecret = getMagicHourWebhookEnv().webhookSecret;
  } catch {
    return NextResponse.json({ error: "Webhook service is unavailable." }, { status: 503 });
  }

  if (
    !verifyMagicHourWebhook(
      getMagicHourWebhookHeaders(request.headers),
      rawBody,
      webhookSecret,
    )
  ) {
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 401 });
  }

  const event = parseMagicHourWebhookEvent(rawBody);

  if (event === null) {
    return NextResponse.json({ error: "Invalid webhook event." }, { status: 400 });
  }

  if (typeof event === "string") {
    return acknowledgement("ignored");
  }

  return handleVideoEvent(event);
}
