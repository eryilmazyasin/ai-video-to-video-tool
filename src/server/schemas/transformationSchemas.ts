import { z } from "zod";

import {
  getImageToImageResolutions,
  imageToImageAspectRatios,
  imageToImageModels,
  imageToImageResolutions,
} from "@/shared/imageToImageOptions";

const maximumNameLength = 100;
const maximumPromptLength = 1_000;

export const uploadRequestSchema = z
  .object({
    uploadcareUuid: z.string().trim().uuid(),
  })
  .strict();

export const transformRequestSchema = z
  .object({
    transformationId: z.string().trim().regex(/^[a-f\d]{24}$/i),
    name: z.string().trim().min(1).max(maximumNameLength).optional(),
    aspectRatio: z.enum(imageToImageAspectRatios).optional(),
    imageCount: z.union([z.literal(1), z.literal(4), z.literal(9), z.literal(16)]).optional(),
    model: z.enum(imageToImageModels).optional(),
    resolution: z.enum(imageToImageResolutions).optional(),
    style: z.object({ prompt: z.string().trim().min(1).max(maximumPromptLength) }).strict(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.model &&
      value.resolution &&
      !getImageToImageResolutions(value.model).includes(value.resolution)
    ) {
      context.addIssue({
        code: "custom",
        path: ["resolution"],
        message: "The selected resolution is not supported by this model.",
      });
    }
  });

export type TransformRequestInput = z.infer<typeof transformRequestSchema>;

export const retryRequestSchema = z
  .object({
    transformationId: z.string().trim().regex(/^[a-f\d]{24}$/i),
  })
  .strict();

export const downloadQuerySchema = z.object({
  transformationId: z.string().regex(/^[a-f\d]{24}$/i),
  outputIndex: z.coerce.number().int().min(0).max(15),
});
