import { z } from "zod";

import { getAnonymousOwner } from "@/server/auth/anonymousOwner";
import {
  createMagicHourVideoToVideo,
  getMagicHourErrorDetails,
} from "@/server/clients/magicHourClient";
import { getMagicHourApiEnv } from "@/server/config/env";
import {
  claimForSubmission,
  findByIdForOwner,
  markFailed,
  markQueued,
} from "@/server/db-actions/transformationActions";
import type { TransformationRequest } from "@/server/types/transformation.types";
import {
  videoToVideoArtStyles,
  videoToVideoModels,
  videoToVideoPromptTypes,
  videoToVideoVersions,
} from "@/shared/videoToVideoOptions";

import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";

const maximumClipSeconds = 60 * 60;
// Limit each case-study job to 15 seconds to keep credit use predictable.
const maximumClipDurationSeconds = 15;
const maximumNameLength = 100;
const maximumPromptLength = 1_000;

const transformRequestSchema = z
  .object({
    transformationId: z.string().trim().regex(/^[a-f\d]{24}$/i),
    name: z.string().trim().min(1).max(maximumNameLength).optional(),
    startSeconds: z.number().finite().min(0).max(maximumClipSeconds),
    endSeconds: z.number().finite().positive().max(maximumClipSeconds),
    fpsResolution: z.enum(["FULL", "HALF"]).optional(),
    style: z
      .object({
        artStyle: z.enum(videoToVideoArtStyles),
        model: z.enum(videoToVideoModels).optional(),
        prompt: z.string().trim().min(1).max(maximumPromptLength).nullable().optional(),
        promptType: z.enum(videoToVideoPromptTypes).optional(),
        version: z.enum(videoToVideoVersions).optional(),
      })
      .strict(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.endSeconds <= value.startSeconds) {
      context.addIssue({
        code: "custom",
        path: ["endSeconds"],
        message: "endSeconds must be greater than startSeconds.",
      });
    }

    if (value.endSeconds - value.startSeconds > maximumClipDurationSeconds) {
      context.addIssue({
        code: "custom",
        path: ["endSeconds"],
        message: "The selected clip must be 15 seconds or shorter.",
      });
    }

    if (
      (value.style.promptType === "custom" ||
        value.style.promptType === "append_default") &&
      !value.style.prompt
    ) {
      context.addIssue({
        code: "custom",
        path: ["style", "prompt"],
        message: "A prompt is required for the selected prompt type.",
      });
    }
  });

function getSubmissionRequest(
  input: z.infer<typeof transformRequestSchema>,
): TransformationRequest {
  return {
    ...(input.name ? { name: input.name } : {}),
    startSeconds: input.startSeconds,
    endSeconds: input.endSeconds,
    ...(input.fpsResolution ? { fpsResolution: input.fpsResolution } : {}),
    style: input.style,
  };
}

export async function POST(request: NextRequest) {
  let requestBody: unknown;

  try {
    requestBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const parsedInput = transformRequestSchema.safeParse(requestBody);

  if (!parsedInput.success) {
    const clipDurationIssue = parsedInput.error.issues.find(
      (issue) => issue.message === "The selected clip must be 15 seconds or shorter.",
    );

    return NextResponse.json(
      {
        error: clipDurationIssue
          ? clipDurationIssue.message
          : "The transformation settings are invalid.",
      },
      { status: 400 },
    );
  }

  const anonymousOwner = getAnonymousOwner(request);
  let transformation;

  try {
    transformation = await findByIdForOwner(
      parsedInput.data.transformationId,
      anonymousOwner.ownerId,
    );
  } catch {
    return NextResponse.json(
      { error: "The transformation could not be prepared. Please try again." },
      { status: 500 },
    );
  }

  if (!transformation) {
    return NextResponse.json(
      { error: "The selected transformation was not found." },
      { status: 404 },
    );
  }

  if (transformation.status !== "ready") {
    return NextResponse.json(
      { error: "The selected transformation has already been submitted." },
      { status: 409 },
    );
  }

  try {
    getMagicHourApiEnv();
  } catch {
    return NextResponse.json(
      { error: "The transformation service is temporarily unavailable. Please try again later." },
      { status: 503 },
    );
  }

  const submissionRequest = getSubmissionRequest(parsedInput.data);
  let claimedTransformation;

  try {
    claimedTransformation = await claimForSubmission(
      transformation._id,
      anonymousOwner.ownerId,
      submissionRequest,
    );
  } catch {
    return NextResponse.json(
      { error: "The transformation could not be prepared. Please try again." },
      { status: 500 },
    );
  }

  if (!claimedTransformation) {
    return NextResponse.json(
      { error: "The selected transformation has already been submitted." },
      { status: 409 },
    );
  }

  const inputFilePath = claimedTransformation.provider.inputFilePath;

  if (!inputFilePath) {
    try {
      await markFailed(claimedTransformation._id, {
        stage: "submission",
        code: "source_video_unavailable",
        message: "The stored source video is unavailable.",
        retryable: false,
      });
    } catch {
      // Preserve the safe response even if recording the invalid source also fails.
    }

    return NextResponse.json(
      { error: "The stored source video is unavailable. Upload it again to continue." },
      { status: 409 },
    );
  }

  let providerResponse;

  try {
    providerResponse = await createMagicHourVideoToVideo({
      ...submissionRequest,
      assets: {
        videoFilePath: inputFilePath,
        videoSource: "file",
      },
    });
  } catch (providerError) {
    console.error(
      "Magic Hour video-to-video submission failed.",
      await getMagicHourErrorDetails(providerError),
    );

    try {
      await markFailed(claimedTransformation._id, {
        stage: "submission",
        code: "provider_submission_failed",
        message: "The transformation could not be submitted. Please try again.",
        retryable: true,
      });
    } catch {
      // Preserve the safe submission response even if recording the failure also fails.
    }

    return NextResponse.json(
      { error: "The transformation could not be submitted. Please try again." },
      { status: 502 },
    );
  }

  try {
    const queuedTransformation = await markQueued(claimedTransformation._id, {
      providerJobId: providerResponse.id,
      creditsCharged: providerResponse.creditsCharged,
    });

    if (!queuedTransformation) {
      throw new Error("The queued transformation record was not found.");
    }
  } catch {
    // Keep the submission claimed to prevent a duplicate provider job after a database failure.
    return NextResponse.json(
      { error: "The transformation was submitted but could not be recorded. Please try again later." },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      transformation: {
        id: claimedTransformation._id.toHexString(),
        status: "queued",
      },
    },
    { status: 202 },
  );
}
