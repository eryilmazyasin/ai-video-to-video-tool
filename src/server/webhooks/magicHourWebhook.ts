import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { z } from "zod";

import type {
  MagicHourImageCompletedEvent,
  MagicHourImageErroredEvent,
  MagicHourImageEvent,
  MagicHourImageEventPayload,
  MagicHourImageStartedEvent,
  MagicHourWebhookHeaders,
} from "@/server/webhooks/magicHourWebhook.types";

const maximumWebhookBodyBytes = 1_000_000;
const webhookTimestampToleranceSeconds = 300;
const hexSignaturePattern = /^[a-f\d]{64}$/i;
const unixTimestampPattern = /^\d{1,12}$/;

const imageEventPayloadSchema = z
  .object({
    id: z.string().min(1).max(128),
    status: z.string().min(1).max(100),
    credits_charged: z.number().finite().nonnegative().optional(),
  })
  .passthrough();

const imageStartedEventSchema = z.object({
  type: z.literal("image.started"),
  payload: imageEventPayloadSchema,
});

const imageErroredEventSchema = z.object({
  type: z.literal("image.errored"),
  payload: imageEventPayloadSchema,
});

const imageCompletedEventSchema = z.object({
  type: z.literal("image.completed"),
  payload: imageEventPayloadSchema.extend({
    downloads: z.array(z.object({ url: z.string().min(1).max(2_048) })).min(1).max(16),
  }),
});

const eventEnvelopeSchema = z
  .object({ type: z.string().min(1).max(100), payload: z.unknown().optional() })
  .passthrough();

function toImageEventPayload(payload: z.infer<typeof imageEventPayloadSchema>): MagicHourImageEventPayload {
  return {
    id: payload.id,
    status: payload.status,
    ...(payload.credits_charged !== undefined
      ? { creditsCharged: payload.credits_charged }
      : {}),
  };
}

function toWebhookHeaders(headers: Headers): MagicHourWebhookHeaders {
  return {
    signature: headers.get("magic-hour-event-signature"),
    timestamp: headers.get("magic-hour-event-timestamp"),
  };
}

export function getMagicHourWebhookHeaders(headers: Headers) {
  return toWebhookHeaders(headers);
}

export async function readMagicHourWebhookBody(request: Request) {
  const declaredSize = request.headers.get("content-length");

  if (declaredSize && Number(declaredSize) > maximumWebhookBodyBytes) {
    return null;
  }

  if (!request.body) {
    return "";
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    byteLength += value.byteLength;

    if (byteLength > maximumWebhookBodyBytes) {
      await reader.cancel();
      return null;
    }

    chunks.push(value);
  }

  const body = new Uint8Array(byteLength);
  let offset = 0;

  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder("utf-8", { fatal: true }).decode(body);
}

export function verifyMagicHourWebhook(
  headers: MagicHourWebhookHeaders,
  rawBody: string,
  webhookSecret: string,
) {
  if (
    !headers.signature ||
    !headers.timestamp ||
    !hexSignaturePattern.test(headers.signature) ||
    !unixTimestampPattern.test(headers.timestamp)
  ) {
    return false;
  }

  const timestamp = Number(headers.timestamp);

  if (
    !Number.isSafeInteger(timestamp) ||
    Math.abs(Math.floor(Date.now() / 1_000) - timestamp) >
      webhookTimestampToleranceSeconds
  ) {
    return false;
  }

  const expectedSignature = createHmac("sha256", webhookSecret)
    .update(`${headers.timestamp}.${rawBody}`, "utf8")
    .digest("hex");

  return timingSafeEqual(
    Buffer.from(headers.signature, "hex"),
    Buffer.from(expectedSignature, "hex"),
  );
}

export function parseMagicHourWebhookEvent(rawBody: string) {
  let parsedBody: unknown;

  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    return null;
  }

  const envelope = eventEnvelopeSchema.safeParse(parsedBody);

  if (!envelope.success) {
    return null;
  }

  if (envelope.data.type === "image.started") {
    const event = imageStartedEventSchema.safeParse(envelope.data);

    return event.success
      ? ({
          type: event.data.type,
          payload: toImageEventPayload(event.data.payload),
        } satisfies MagicHourImageStartedEvent)
      : null;
  }

  if (envelope.data.type === "image.errored") {
    const event = imageErroredEventSchema.safeParse(envelope.data);

    return event.success
      ? ({
          type: event.data.type,
          payload: toImageEventPayload(event.data.payload),
        } satisfies MagicHourImageErroredEvent)
      : null;
  }

  if (envelope.data.type === "image.completed") {
    const event = imageCompletedEventSchema.safeParse(envelope.data);

    return event.success
      ? ({
          type: event.data.type,
          payload: {
            ...toImageEventPayload(event.data.payload),
            downloads: event.data.payload.downloads.map((download) => ({
              url: download.url,
            })),
          },
        } satisfies MagicHourImageCompletedEvent)
      : null;
  }

  return envelope.data.type as Exclude<string, MagicHourImageEvent["type"]>;
}

export function getHttpsDownloadUrls(event: MagicHourImageCompletedEvent) {
  const urls = event.payload.downloads.map((download) => download.url);

  try {
    return urls.every((url) => new URL(url).protocol === "https:") ? urls : null;
  } catch {
    return null;
  }
}
