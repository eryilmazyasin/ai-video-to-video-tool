import { uploadOutputImageFromUrl } from "@/server/clients/cloudinaryClient";
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
  getHttpsDownloadUrls,
  getMagicHourWebhookHeaders,
  parseMagicHourWebhookEvent,
  readMagicHourWebhookBody,
  verifyMagicHourWebhook,
} from "@/server/webhooks/magicHourWebhook";
import { NextRequest, NextResponse } from "next/server";

import type {
  MagicHourImageCompletedEvent,
  MagicHourImageEvent,
} from "@/server/webhooks/magicHourWebhook.types";

export const runtime = "nodejs";
export const maxDuration = 60;

function acknowledgement(state: string) {
  return NextResponse.json({ received: true, state });
}

async function recordRetryableOutputFailure(
  transformationId: Parameters<typeof markOutputCopyFailed>[0],
) {
  try {
    await markOutputCopyFailed(transformationId);
  } catch {
    // A non-2xx response still asks the provider to retry this delivery.
  }
}

async function handleCompletedEvent(event: MagicHourImageCompletedEvent) {
  const downloadUrls = getHttpsDownloadUrls(event);

  if (!downloadUrls) {
    return NextResponse.json(
      { error: "The completed event is invalid." },
      { status: 400 },
    );
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
    return NextResponse.json(
      { error: "The event could not be recorded." },
      { status: 500 },
    );
  }

  if (!claimedTransformation) {
    return acknowledgement("ignored");
  }

  const expectedOutputCount = claimedTransformation.request?.imageCount ?? 1;

  if (downloadUrls.length !== expectedOutputCount) {
    await recordRetryableOutputFailure(claimedTransformation._id);
    return NextResponse.json(
      { error: "The completed event did not include all generated images." },
      { status: 502 },
    );
  }

  let outputImages;

  try {
    // The output copy is intentionally inline so a failed delivery can be retried safely.
    const uploads = await Promise.allSettled(downloadUrls.map((sourceUrl, outputIndex) =>
      uploadOutputImageFromUrl({ sourceUrl, providerJobId: event.payload.id, outputIndex }),
    ));

    if (uploads.some((upload) => upload.status === "rejected")) {
      throw new Error("At least one generated image could not be saved.");
    }

    outputImages = uploads.map((upload) => {
      if (upload.status !== "fulfilled") throw new Error("Generated image upload failed.");
      return upload.value;
    });
  } catch {
    await recordRetryableOutputFailure(claimedTransformation._id);

    return NextResponse.json(
      { error: "The generated image could not be saved." },
      { status: 502 },
    );
  }

  try {
    const completedTransformation = await markCompletedFromOutput(
      claimedTransformation._id,
      {
        outputs: outputImages.map((image) => ({
          cloudinaryPublicId: image.publicId,
          cloudinaryUrl: image.secureUrl,
        })),
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

    return NextResponse.json(
      { error: "The event could not be finalized." },
      { status: 500 },
    );
  }

  return acknowledgement("completed");
}

async function handleImageEvent(event: MagicHourImageEvent) {
  try {
    const transformation = await findByProviderJobId(event.payload.id);

    if (!transformation) {
      return acknowledgement("ignored");
    }
  } catch {
    return NextResponse.json(
      { error: "The event could not be recorded." },
      { status: 500 },
    );
  }

  if (event.type === "image.started") {
    try {
      await markProcessingByProviderJobId(
        event.payload.id,
        event.payload.status,
      );
    } catch {
      return NextResponse.json(
        { error: "The event could not be recorded." },
        { status: 500 },
      );
    }

    return acknowledgement("processing");
  }

  if (event.type === "image.errored") {
    try {
      const failedTransformation = await markProviderErrored(
        event.payload.id,
        event.payload.status,
      );

      if (!failedTransformation) {
        return acknowledgement("ignored");
      }
    } catch {
      return NextResponse.json(
        { error: "The event could not be recorded." },
        { status: 500 },
      );
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
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 },
    );
  }

  if (rawBody === null) {
    return NextResponse.json(
      { error: "Request body is too large." },
      { status: 413 },
    );
  }

  let webhookSecret: string;

  try {
    webhookSecret = getMagicHourWebhookEnv().webhookSecret;
  } catch {
    return NextResponse.json(
      { error: "Webhook service is unavailable." },
      { status: 503 },
    );
  }

  if (
    !verifyMagicHourWebhook(
      getMagicHourWebhookHeaders(request.headers),
      rawBody,
      webhookSecret,
    )
  ) {
    return NextResponse.json(
      { error: "Invalid webhook signature." },
      { status: 401 },
    );
  }

  const event = parseMagicHourWebhookEvent(rawBody);

  if (event === null) {
    return NextResponse.json(
      { error: "Invalid webhook event." },
      { status: 400 },
    );
  }

  if (typeof event === "string") {
    return acknowledgement("ignored");
  }

  return handleImageEvent(event);
}
