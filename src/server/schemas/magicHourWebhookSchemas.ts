import { z } from "zod";

export const magicHourImageEventPayloadSchema = z
  .object({
    id: z.string().min(1).max(128),
    status: z.string().min(1).max(100),
    credits_charged: z.number().finite().nonnegative().optional(),
  })
  .loose();

export type MagicHourImageEventPayloadInput = z.infer<
  typeof magicHourImageEventPayloadSchema
>;

export const magicHourImageStartedEventSchema = z.object({
  type: z.literal("image.started"),
  payload: magicHourImageEventPayloadSchema,
});

export const magicHourImageErroredEventSchema = z.object({
  type: z.literal("image.errored"),
  payload: magicHourImageEventPayloadSchema,
});

export const magicHourImageCompletedEventSchema = z.object({
  type: z.literal("image.completed"),
  payload: magicHourImageEventPayloadSchema.extend({
    downloads: z.array(z.object({ url: z.string().min(1).max(2_048) })).min(1).max(16),
  }),
});

export const magicHourEventEnvelopeSchema = z
  .object({
    type: z.string().min(1).max(100),
    payload: z.unknown().optional(),
  })
  .loose();
