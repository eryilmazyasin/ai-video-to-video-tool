import { z } from "zod";

import { getAnonymousOwner } from "@/server/auth/anonymousOwner";
import { createMagicHourImageToImage, getMagicHourErrorDetails } from "@/server/clients/magicHourClient";
import { getMagicHourApiEnv } from "@/server/config/env";
import { claimForSubmission, findByIdForOwner, markFailed, markQueued } from "@/server/db-actions/transformationActions";
import type { TransformationRequest } from "@/server/types/transformation.types";
import { getImageToImageResolutions, imageToImageAspectRatios, imageToImageModels, imageToImageResolutions } from "@/shared/imageToImageOptions";

import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";

const maximumNameLength = 100;
const maximumPromptLength = 1_000;

const transformRequestSchema = z.object({
  transformationId: z.string().trim().regex(/^[a-f\d]{24}$/i),
  name: z.string().trim().min(1).max(maximumNameLength).optional(),
  aspectRatio: z.enum(imageToImageAspectRatios).optional(),
  imageCount: z.union([z.literal(1), z.literal(4), z.literal(9), z.literal(16)]).optional(),
  model: z.enum(imageToImageModels).optional(),
  resolution: z.enum(imageToImageResolutions).optional(),
  style: z.object({ prompt: z.string().trim().min(1).max(maximumPromptLength) }).strict(),
}).strict().superRefine((value, context) => {
  if (value.model && value.resolution && !getImageToImageResolutions(value.model).includes(value.resolution)) {
    context.addIssue({ code: "custom", path: ["resolution"], message: "The selected resolution is not supported by this model." });
  }
});

function getSubmissionRequest(input: z.infer<typeof transformRequestSchema>): TransformationRequest {
  return {
    ...(input.name ? { name: input.name } : {}),
    ...(input.aspectRatio ? { aspectRatio: input.aspectRatio } : {}),
    ...(input.imageCount ? { imageCount: input.imageCount } : {}),
    ...(input.model ? { model: input.model } : {}),
    ...(input.resolution ? { resolution: input.resolution } : {}),
    style: input.style,
  };
}

export async function POST(request: NextRequest) {
  let requestBody: unknown;
  try { requestBody = await request.json(); } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsedInput = transformRequestSchema.safeParse(requestBody);
  if (!parsedInput.success) {
    return NextResponse.json({ error: "The image transformation settings are invalid." }, { status: 400 });
  }

  const anonymousOwner = getAnonymousOwner(request);
  let transformation;
  try {
    transformation = await findByIdForOwner(parsedInput.data.transformationId, anonymousOwner.ownerId);
  } catch {
    return NextResponse.json({ error: "The transformation could not be prepared. Please try again." }, { status: 500 });
  }
  if (!transformation) return NextResponse.json({ error: "The selected transformation was not found." }, { status: 404 });
  if (transformation.status !== "ready") return NextResponse.json({ error: "The selected transformation has already been submitted." }, { status: 409 });

  try { getMagicHourApiEnv(); } catch {
    return NextResponse.json({ error: "The transformation service is temporarily unavailable. Please try again later." }, { status: 503 });
  }

  const submissionRequest = getSubmissionRequest(parsedInput.data);
  let claimedTransformation;
  try {
    claimedTransformation = await claimForSubmission(transformation._id, anonymousOwner.ownerId, submissionRequest);
  } catch {
    return NextResponse.json({ error: "The transformation could not be prepared. Please try again." }, { status: 500 });
  }
  if (!claimedTransformation) return NextResponse.json({ error: "The selected transformation has already been submitted." }, { status: 409 });

  const inputFilePath = claimedTransformation.provider.inputFilePath;
  if (!inputFilePath) {
    try {
      await markFailed(claimedTransformation._id, { stage: "submission", code: "source_image_unavailable", message: "The stored source image is unavailable.", retryable: false });
    } catch {
      // Preserve the safe response even if recording the invalid source also fails.
    }
    return NextResponse.json({ error: "The stored source image is unavailable. Upload it again to continue." }, { status: 409 });
  }

  let providerResponse;
  try {
    providerResponse = await createMagicHourImageToImage({ ...submissionRequest, assets: { imageFilePaths: [inputFilePath] } });
  } catch (providerError) {
    const providerDetails = await getMagicHourErrorDetails(providerError);
    console.error("Magic Hour image-to-image submission failed.", providerDetails);
    const errorMessage = providerDetails.status === 402
      ? "Not enough Magic Hour credits for these image settings."
      : providerDetails.status === 422 || providerDetails.status === 400
        ? "Magic Hour rejected these settings. Try fewer results or a different model or resolution."
        : "The transformation could not be submitted. Please try again.";
    try {
      await markFailed(claimedTransformation._id, {
        stage: "submission",
        code: providerDetails.status === 402 ? "insufficient_credits" : providerDetails.status === 422 || providerDetails.status === 400 ? "invalid_image_settings" : "provider_submission_failed",
        message: errorMessage,
        retryable: true,
      });
    } catch {
      // Preserve the safe submission response even if recording the failure also fails.
    }
    return NextResponse.json({ error: errorMessage }, { status: providerDetails.status === 402 ? 402 : providerDetails.status === 422 || providerDetails.status === 400 ? 422 : 502 });
  }

  try {
    const queuedTransformation = await markQueued(claimedTransformation._id, { providerJobId: providerResponse.id, creditsCharged: providerResponse.creditsCharged });
    if (!queuedTransformation) throw new Error("The queued transformation record was not found.");
  } catch {
    return NextResponse.json({ error: "The transformation was submitted but could not be recorded. Please try again later." }, { status: 500 });
  }

  return NextResponse.json({ transformation: { id: claimedTransformation._id.toHexString(), status: "queued" } }, { status: 202 });
}
