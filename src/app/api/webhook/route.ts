import { getMagicHourWebhookEnv } from "@/server/config/env";
import { getMagicHourImageProject } from "@/server/clients/magicHourClient";
import {
  findByProviderJobId,
  markProcessingByProviderJobId,
  markProviderErrored,
} from "@/server/db-actions/transformationActions";
import { completeMagicHourImage } from "@/server/webhooks/magicHourImageCompletion";
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

async function handleCompletedEvent(event: MagicHourImageCompletedEvent) {
  const downloadUrls = getHttpsDownloadUrls(event);

  if (!downloadUrls) {
    return NextResponse.json(
      { error: "The completed event is invalid." },
      { status: 400 },
    );
  }

  const result = await completeMagicHourImage({
    providerJobId: event.payload.id,
    rawStatus: event.payload.status,
    downloads: downloadUrls.map((url) => ({ url })),
    ...(event.payload.creditsCharged !== undefined
      ? { creditsCharged: event.payload.creditsCharged }
      : {}),
  });

  if (result === "completed" || result === "ignored") {
    return acknowledgement(result);
  }

  const errorMessages = {
    invalid_output: "The completed event did not include all generated images.",
    output_save_failed: "The generated image could not be saved.",
    recording_failed: "The event could not be recorded.",
  } as const;

  return NextResponse.json(
    { error: errorMessages[result] },
    { status: result === "recording_failed" ? 500 : 502 },
  );
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
    let providerError = null;
    let creditsCharged = event.payload.creditsCharged;

    try {
      const project = await getMagicHourImageProject(event.payload.id);

      providerError = project.error;
      creditsCharged = project.creditsCharged;
    } catch {
      // The webhook still records a generic failure if the detail lookup is unavailable.
    }

    try {
      const failedTransformation = await markProviderErrored(
        event.payload.id,
        event.payload.status,
        providerError,
        creditsCharged,
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
